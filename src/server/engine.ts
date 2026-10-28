import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { activeHour, hardFilter, localDate, weightedScore } from '@/lib/policy';
import { analysisSchema, messageSchema, screeningSchema } from '@/lib/schemas';
import { hhVacancySchema, hhForUser, normalizeVacancy, HhError } from './hh';
import { llm } from './ai';
import { enqueue } from './queue';
import { notify } from './notifications';
export async function event(userId: string, kind: string, message: string, applicationId?: string) {
  return db.agentEvent.create({ data: { userId, kind, message, applicationId } });
}
export async function task(
  userId: string,
  key: string,
  title: string,
  description: string,
  type: string,
  applicationId?: string,
  deadline?: Date,
) {
  return db.userTask.upsert({
    where: { dedupeKey: key },
    create: { userId, dedupeKey: key, title, description, type, applicationId, deadline },
    update: { description, completedAt: null },
  });
}
export async function running(userId: string) {
  const s = await db.appSettings.findUniqueOrThrow({ where: { userId } });
  return s.agentState === 'RUNNING' && activeHour(s.timezone, s.activeStart, s.activeEnd);
}
export async function scan(userId: string, searchId: string) {
  if (!(await running(userId))) return;
  const p = await db.searchProfile.findFirstOrThrow({
    where: { id: searchId, userId, active: true },
    include: { resumes: true },
  });
  const execution = await db.agentExecution.create({ data: { userId, kind: 'SCAN' } });
  try {
    const q = new URLSearchParams({
      text: p.query,
      area: p.area,
      currency: p.currency,
      per_page: '50',
      order_by: 'publication_time',
    });
    if (p.salaryMin) q.set('salary', String(p.salaryMin));
    if (p.workFormat !== 'ANY') q.set('work_format', p.workFormat);
    if (p.experience) q.set('experience', p.experience);
    if (p.employment) q.set('employment', p.employment);
    if (p.schedule) q.set('schedule', p.schedule);
    for (let page = 0; page < 40; page++) {
      if (
        !(await running(userId)) ||
        !(await db.searchProfile.findUnique({ where: { id: searchId } }))?.active
      )
        break;
      q.set('page', String(page));
      const listing = z
        .object({
          items: z.array(z.object({ id: z.string() })),
          pages: z.number().int(),
        })
        .parse(await (await hhForUser(userId, '/vacancies?' + q)).json());
      for (const item of listing.items) {
        if (!(await running(userId))) break;
        if (
          await db.application.findUnique({
            where: { userId_vacancyId: { userId, vacancyId: item.id } },
          })
        )
          continue;
        const raw = hhVacancySchema.parse(
          await (await hhForUser(userId, `/vacancies/${encodeURIComponent(item.id)}`)).json(),
        );
        const v = normalizeVacancy(raw);
        await db.vacancy.upsert({ where: { id: v.id }, create: v, update: v });
        const settings = await db.appSettings.findUniqueOrThrow({ where: { userId } });
        const excluded =
          hardFilter(v, p, settings.blacklist) ??
          (settings.blockedVacancies.includes(v.id) ? 'Вакансия исключена пользователем' : null);
        const app = await db.application.upsert({
          where: { userId_vacancyId: { userId, vacancyId: v.id } },
          create: {
            userId,
            vacancyId: v.id,
            searchId: p.id,
            status: excluded ? 'SKIPPED' : 'DISCOVERED',
            error: excluded,
          },
          update: {},
        });
        if (!excluded) await enqueue('vacancy-analysis', { userId, applicationId: app.id }, app.id);
      }
      if (page + 1 >= listing.pages) break;
    }
    await db.searchProfile.update({
      where: { id: p.id },
      data: {
        lastScanAt: new Date(),
        nextScanAt: new Date(Date.now() + p.intervalMinutes * 60000),
      },
    });
    await event(userId, 'SCAN', `Завершена проверка «${p.name}»`);
    await db.agentExecution.update({
      where: { id: execution.id },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });
  } catch (e) {
    await db.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: 'FAILED',
        error: e instanceof HhError ? e.message : 'Проверка не завершена',
        finishedAt: new Date(),
      },
    });
    if (e instanceof HhError && [400, 401, 403].includes(e.status)) {
      await task(
        userId,
        `auth-${userId}`,
        'Подключите hh.ru повторно',
        'Проверьте авторизацию и доступ приложения в настройках.',
        'AUTH',
      );
      await notify(
        userId,
        `auth-${execution.id}`,
        'JobHunter AI — требуется подключение hh.ru',
        'Агент приостановлен. Подключите hh.ru в настройках.',
        'AUTH',
      );
    }
    throw e;
  }
}
export async function analyze(userId: string, applicationId: string) {
  if (!(await running(userId))) return;
  const a = await db.application.findFirstOrThrow({
    where: { id: applicationId, userId },
    include: {
      vacancy: true,
      search: { include: { resumes: { include: { resume: true } } } },
      analysis: true,
    },
  });
  if (!['DISCOVERED', 'ANALYZING'].includes(a.status)) return;
  const s = await db.appSettings.findUniqueOrThrow({ where: { userId } });
  const excluded = hardFilter(a.vacancy, a.search, s.blacklist);
  if (excluded) {
    await db.application.update({
      where: { id: a.id },
      data: { status: 'SKIPPED', error: excluded },
    });
    return;
  }
  const candidate = await db.candidateProfile.findUnique({
    where: { userId },
    include: { skills: true },
  });
  const resumes = a.search.resumes.map((r) => r.resume);
  if (!candidate || !resumes.length) {
    await manual(a.id, userId, 'Заполните профиль кандидата и выберите резюме.');
    return;
  }
  const claimed = await db.application.updateMany({
    where: {
      id: a.id,
      OR: [
        { status: 'DISCOVERED' },
        { status: 'ANALYZING', updatedAt: { lt: new Date(Date.now() - 300000) } },
      ],
    },
    data: { status: 'ANALYZING' },
  });
  if (!claimed.count) return;
  try {
    const feedback = await db.application.findMany({
      where: { userId, feedback: { not: null } },
      select: { feedback: true, vacancy: { select: { title: true, employer: true } } },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
    const result = await llm(
      userId,
      'ANALYSIS',
      analysisSchema,
      'Верни JSON с decision apply/skip/review, matchingSkills[], missingSkills[], advantages[], risks[], recommendedResumeId, reason, confidence 0..1 и components {stack,experience,salary,format,duties,preferences}: каждое 0..100. Выбери только переданный ID резюме. Неизвестная зарплата снижает confidence. Учти обратную связь и whitelist как предпочтения.',
      { vacancy: a.vacancy, candidate, resumes, search: a.search, feedback },
    );
    if (!resumes.some((r) => r.id === result.recommendedResumeId))
      throw new Error('AI выбрал чужое резюме');
    const score = weightedScore(result.components, a.search.weights);
    const salaryUnknown =
      !!a.search.salaryMin &&
      (!a.vacancy.currency || (a.vacancy.salaryFrom === null && a.vacancy.salaryTo === null));
    const review = result.confidence < 0.8 || result.decision === 'review' || salaryUnknown;
    await db.$transaction([
      db.vacancyAnalysis.upsert({
        where: { applicationId: a.id },
        create: {
          applicationId: a.id,
          score,
          confidence: result.confidence,
          decision: result.decision,
          reason: result.reason,
          data: result,
        },
        update: {
          score,
          confidence: result.confidence,
          decision: result.decision,
          reason: result.reason,
          data: result,
        },
      }),
      db.application.update({
        where: { id: a.id },
        data: {
          resumeId: result.recommendedResumeId,
          status:
            result.decision === 'skip' || score < a.search.minScore
              ? 'SKIPPED'
              : review
                ? 'REQUIRES_USER_ACTION'
                : 'READY_TO_APPLY',
        },
      }),
    ]);
    await event(userId, 'ANALYSIS', `Соответствие ${score}%. ${result.reason}`, a.id);
    if (review)
      await manual(
        a.id,
        userId,
        salaryUnknown
          ? 'Зарплата не подтверждена. Проверьте соответствие вашему минимуму.'
          : 'AI недостаточно уверен в оценке. Проверьте вакансию.',
      );
    else if (result.decision === 'apply' && score >= a.search.minScore)
      await enqueue('cover-letter-generation', { userId, applicationId: a.id }, a.id);
  } catch (e) {
    await manual(a.id, userId, e instanceof Error ? e.message : 'Ошибка AI');
  }
}
export async function manual(applicationId: string, userId: string, reason: string) {
  await db.application.update({
    where: { id: applicationId },
    data: { status: 'REQUIRES_USER_ACTION', error: reason },
  });
  await task(
    userId,
    `review-${applicationId}`,
    'Проверьте вакансию',
    reason,
    'REVIEW',
    applicationId,
  );
  await notify(userId, `review-${applicationId}`, 'JobHunter AI — требуется проверка', reason);
}
export async function factsFor(userId: string) {
  const p = await db.candidateProfile.findUnique({ where: { userId }, include: { skills: true } });
  if (!p) throw new Error('Заполните подтверждённые факты');
  return [
    ...(p.english ? [{ id: 'profile-english', text: `Уровень английского: ${p.english}.` }] : []),
    ...(p.salary !== null
      ? [{ id: 'profile-salary', text: `Зарплатные ожидания: ${p.salary} рублей.` }]
      : []),
    ...(p.travel ? [{ id: 'profile-travel', text: 'Готов к командировкам.' }] : []),
    ...(p.relocate ? [{ id: 'profile-relocation', text: 'Готов к переезду.' }] : []),
    ...p.facts
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `fact-${i}`, text })),
    ...p.skills.map((s) => ({ id: s.id, text: `${s.name}: ${s.years} лет опыта. ${s.evidence}` })),
  ];
}
export async function generateLetter(userId: string, applicationId: string, manualRequest = false) {
  if (!manualRequest && !(await running(userId))) return;
  const a = await db.application.findFirstOrThrow({
    where: { id: applicationId, userId },
    include: { vacancy: true, search: true, letter: true },
  });
  if (!manualRequest && a.status !== 'READY_TO_APPLY') return;
  const need =
    a.vacancy.requiresLetter ||
    a.search.letterPolicy === 'ALWAYS' ||
    a.search.letterPolicy === 'AI';
  if (need && (!a.letter || manualRequest)) {
    try {
      const facts = await factsFor(userId);
      const settings = await db.appSettings.findUniqueOrThrow({ where: { userId } });
      const selection = await llm(
        userId,
        'LETTER',
        z.object({
          includeLetter: z.boolean(),
          factIds: z.array(z.string()).max(3),
          language: z.enum(['ru', 'en']),
        }),
        'Выбери 1–3 самых релевантных подтверждённых факта для краткого сопроводительного письма. Верни {includeLetter:boolean,factIds:string[],language:ru|en}. includeLetter false допускается только для необязательного письма при политике AI. Язык по вакансии. Выбирай только существующие ID. Текст фактов будет использован дословно.',
        {
          vacancy: a.vacancy,
          facts,
          instructions: settings.letterInstructions,
          policy: a.search.letterPolicy,
        },
      );
      if (
        selection.includeLetter ||
        a.vacancy.requiresLetter ||
        a.search.letterPolicy === 'ALWAYS'
      ) {
        if (!selection.factIds.length) throw new Error('Нет подтверждённых фактов для письма');
        const selected = selection.factIds.map((id) => facts.find((f) => f.id === id));
        if (selected.some((x) => !x)) throw new Error('Неподтверждённые факты в письме');
        const en = selection.language === 'en';
        const text = [
          en ? 'Hello!' : 'Здравствуйте!',
          en
            ? `I would like to apply for ${a.vacancy.title}.`
            : `Хочу откликнуться на вакансию «${a.vacancy.title}».`,
          ...selected.map((f) => f!.text),
          en
            ? 'I would be happy to discuss my experience and your tasks.'
            : 'Буду рад обсудить мой опыт и ваши задачи.',
        ].join('\n');
        if (text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length > 7)
          throw new Error('Сократите подтверждённые факты: письмо превышает 7 предложений');
        await db.coverLetter.upsert({
          where: { applicationId },
          create: { applicationId, text, factIds: selection.factIds },
          update: { text, factIds: selection.factIds },
        });
        await event(
          userId,
          'LETTER',
          'Подготовлено письмо из подтверждённых фактов',
          applicationId,
        );
      }
    } catch (e) {
      await manual(a.id, userId, e instanceof Error ? e.message : 'Ошибка письма');
      return false;
    }
  }
  if (!manualRequest) await enqueue('application-submit', { userId, applicationId: a.id }, a.id);
  return true;
}
export async function prepareApplication(userId: string, applicationId: string) {
  if (!(await running(userId))) return;
  const a = await db.application.findFirstOrThrow({
    where: { id: applicationId, userId },
    include: { vacancy: true, search: true, letter: true, analysis: true },
  });
  if (!['READY_TO_APPLY', 'AWAITING_APPROVAL'].includes(a.status)) return;
  const s = await db.appSettings.findUniqueOrThrow({ where: { userId } });
  if (!a.search.active) return;
  const reason = hardFilter(a.vacancy, a.search, s.blacklist);
  if (reason) {
    await db.application.update({
      where: { id: a.id },
      data: { status: 'SKIPPED', error: reason },
    });
    return;
  }
  if (!a.resumeId || !a.analysis || a.analysis.score < a.search.minScore) {
    await manual(a.id, userId, 'Не выбрано резюме или рейтинг ниже порога.');
    return;
  }
  if (a.vacancy.requiresLetter && !a.letter) {
    await manual(a.id, userId, 'Требуется сопроводительное письмо.');
    return;
  }
  const since = new Date(Date.now() - 86400000);
  const [total, profileTotal, employerTotal] = await Promise.all([
    db.application.count({ where: { userId, appliedAt: { gte: since } } }),
    db.application.count({ where: { userId, searchId: a.searchId, appliedAt: { gte: since } } }),
    db.application.count({
      where: { userId, appliedAt: { gte: since }, vacancy: { employerId: a.vacancy.employerId } },
    }),
  ]);
  if (
    total >= s.dailyLimit ||
    profileTotal >= a.search.dailyLimit ||
    employerTotal >= s.employerLimit
  ) {
    await db.application.update({
      where: { id: a.id },
      data: { status: 'AWAITING_APPROVAL', error: 'Достигнут лимит за последние 24 часа' },
    });
    await task(
      userId,
      `limit-${a.id}`,
      'Достигнут лимит откликов',
      'Подготовка новых откликов ограничена вашими правилами.',
      'LIMIT',
      a.id,
    );
    await notify(
      userId,
      `limit-${userId}-${localDate(s.timezone)}`,
      'JobHunter AI — достигнут лимит',
      'Новые отклики не допускаются до освобождения лимита.',
      'LIMIT',
    );
    return;
  }
  const detail = hhVacancySchema.parse(
    await (await hhForUser(userId, `/vacancies/${encodeURIComponent(a.vacancyId)}`)).json(),
  );
  if (detail.archived) {
    await db.application.update({
      where: { id: a.id },
      data: { status: 'SKIPPED', error: 'Вакансия уже в архиве' },
    });
    return;
  }
  if (!(await running(userId))) return;
  const restricted = detail.has_test || !!detail.response_url;
  const explanation = s.dryRun
    ? 'Dry Run: материалы подготовлены, отправка отключена.'
    : restricted
      ? 'На hh.ru требуется анкета, тест или внешний отклик. Откройте вакансию и завершите действие лично.'
      : 'Отправка соискателя не описана в текущей public OpenAPI hh.ru. Откройте вакансию и отправьте подготовленные материалы вручную.';
  await db.$transaction([
    db.application.update({
      where: { id: a.id },
      data: { status: s.dryRun ? 'AWAITING_APPROVAL' : 'REQUIRES_USER_ACTION', error: explanation },
    }),
    db.userTask.upsert({
      where: { dedupeKey: `apply-${a.id}` },
      create: {
        userId,
        applicationId: a.id,
        dedupeKey: `apply-${a.id}`,
        title: restricted ? 'Пройдите вопросы на hh.ru' : 'Подтвердите и отправьте отклик',
        description: explanation,
        type: restricted ? 'SCREENING' : 'APPROVAL',
      },
      update: { description: explanation },
    }),
  ]);
  await event(userId, 'PREPARED', explanation, a.id);
  await notify(
    userId,
    `prepared-${a.id}`,
    'JobHunter AI — отклик подготовлен',
    `${a.vacancy.title}\n${a.vacancy.employer}\n${explanation}\n${a.vacancy.url}`,
  );
}
export async function confirmManualApplication(userId: string, applicationId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "userId" FROM "AppSettings" WHERE "userId"=${userId} FOR UPDATE`;
    const a = await tx.application.findFirstOrThrow({
      where: { id: applicationId, userId },
      include: { vacancy: true, search: true },
    });
    if (a.status === 'APPLIED') return a;
    const s = await tx.appSettings.findUniqueOrThrow({ where: { userId } });
    if (s.dryRun) throw new Error('Выключите Dry Run для фиксации реального отклика');
    const start = new Date(Date.now() - 86400000);
    const count = await tx.application.count({ where: { userId, appliedAt: { gte: start } } }),
      profileCount = await tx.application.count({
        where: { userId, searchId: a.searchId, appliedAt: { gte: start } },
      }),
      employerCount = await tx.application.count({
        where: { userId, appliedAt: { gte: start }, vacancy: { employerId: a.vacancy.employerId } },
      });
    if (
      count >= s.dailyLimit ||
      profileCount >= a.search.dailyLimit ||
      employerCount >= s.employerLimit
    )
      throw new Error('Достигнут лимит за последние 24 часа');
    const result = await tx.application.update({
      where: { id: a.id },
      data: {
        status: 'APPLIED',
        pipeline: 'SENT',
        resultSource: 'USER_REPORTED',
        appliedAt: new Date(),
        error: null,
      },
    });
    await tx.userTask.updateMany({
      where: {
        applicationId: a.id,
        userId,
        completedAt: null,
        type: { in: ['APPROVAL', 'REVIEW'] },
      },
      data: { completedAt: new Date() },
    });
    await tx.agentEvent.create({
      data: {
        userId,
        applicationId: a.id,
        kind: 'USER_REPORTED',
        message: 'Пользователь подтвердил отправку на hh.ru. Подтверждение API отсутствует.',
      },
    });
    return result;
  });
}
export async function classifyQuestion(userId: string, applicationId: string, text: string) {
  const facts = await factsFor(userId);
  const result = await llm(
    userId,
    'SCREENING',
    screeningSchema,
    'Классифицируй вопрос. JSON {category:FACTUAL|TECHNICAL|ASSIGNMENT|PERSONAL|UNKNOWN,answer:string|null,factIds:string[],reason,deadline:ISO datetime|null,technologies:string[],materials:URL[]}. FACTUAL — только факты, отсутствие сведений означает answer null. TECHNICAL — только черновик для пользователя. ASSIGNMENT — тестовое приложение/проект, SQL-проект, GitHub, не выполнять. PERSONAL — психология/видео/наблюдение/личное выполнение. UNKNOWN — не отвечать. Для ASSIGNMENT/PERSONAL/UNKNOWN answer null. Никаких автоматических отправок.',
    { text, facts },
  );
  if (result.factIds.some((id) => !facts.some((f) => f.id === id)))
    throw new Error('AI использовал неизвестный факт');
  const answer =
    result.category === 'FACTUAL'
      ? result.factIds.map((id) => facts.find((f) => f.id === id)!.text).join('\n')
      : result.category === 'TECHNICAL'
        ? result.answer
        : null;
  const q = await db.screeningQuestion.create({
    data: {
      applicationId,
      text,
      category: result.category,
      materials: result.materials,
      technologies: result.technologies,
      deadline: result.deadline ? new Date(result.deadline) : null,
      ...(answer ? { answer: { create: { text: answer, factIds: result.factIds } } } : {}),
    },
  });
  await task(
    userId,
    `question-${q.id}`,
    result.category === 'ASSIGNMENT'
      ? 'Выполните тестовое задание'
      : 'Проверьте вопрос работодателя',
    text + '\n' + result.reason,
    'SCREENING',
    applicationId,
    q.deadline ?? undefined,
  );
  await notify(userId, `question-${q.id}`, 'JobHunter AI — вопрос работодателя', text);
  return q;
}
export async function syncMessages(userId: string) {
  if (!(await running(userId))) return;
  const listSchema = z.object({
    items: z.array(z.object({ id: z.string(), vacancy_id: z.string().nullable().optional() })),
    pages: z.number().int(),
  });
  const settings = await db.appSettings.findUniqueOrThrow({ where: { userId } });
  const firstPage = settings.chatPage;
  for (let page = firstPage; page < Math.min(firstPage + 10, 51); page++) {
    if (!(await running(userId))) return;
    const data = listSchema.parse(
      await (await hhForUser(userId, `/common/chats?page=${page}&per_page=20`)).json(),
    );
    for (const chat of data.items) {
      const cursorKey = `${userId}-${chat.id}`;
      let cursor = await db.chatCursor.findUnique({ where: { id: cursorKey } });
      for (let batch = 0; batch < 20; batch++) {
        if (!(await running(userId))) return;
        const q = new URLSearchParams({ limit: '50', order: 'next' });
        if (cursor?.lastMessageId) q.set('start_message_id', cursor.lastMessageId);
        const raw = await (
          await hhForUser(userId, `/common/chats/${encodeURIComponent(chat.id)}/messages?${q}`)
        ).json();
        const messages = z
          .object({
            has_more: z.boolean(),
            messages: z.array(
              z.object({
                id: z.string(),
                payload: z.object({
                  text: z.string().nullable().optional(),
                  attachments: z
                    .array(z.object({ url: z.string().url(), title: z.string() }))
                    .nullable()
                    .optional(),
                }),
                sender_display_info: z.object({
                  role: z.string().nullable(),
                  is_current_participant: z.boolean(),
                }),
              }),
            ),
          })
          .parse(raw);
        for (const m of messages.messages) {
          if (
            m.sender_display_info.is_current_participant ||
            m.sender_display_info.role !== 'EMPLOYER'
          )
            continue;
          const text = [
            m.payload.text,
            ...(m.payload.attachments ?? []).map((a) => `${a.title}: ${a.url}`),
          ]
            .filter(Boolean)
            .join('\n');
          if (!text) continue;
          const message = await db.employerMessage.upsert({
            where: { userId_externalId: { userId, externalId: m.id } },
            create: {
              userId,
              externalId: m.id,
              chatId: chat.id,
              text,
              vacancyId: chat.vacancy_id ?? null,
            },
            update: {},
          });
          if (message.category === 'PENDING')
            await enqueue(
              'message-classification',
              { userId, messageId: message.id },
              `classify-${message.id}-${Math.floor(Date.now() / 900000)}`,
            );
        }
        const last = messages.messages.at(-1)?.id;
        if (!last || last === cursor?.lastMessageId) break;
        cursor = await db.chatCursor.upsert({
          where: { id: cursorKey },
          create: { id: cursorKey, lastMessageId: last },
          update: { lastMessageId: last },
        });
        if (!messages.has_more) break;
      }
    }
    await db.appSettings.update({
      where: { userId },
      data: { chatPage: page + 1 >= data.pages || page >= 50 ? 0 : page + 1 },
    });
    if (!data.items.length || page + 1 >= data.pages) break;
  }
  await db.appSettings.update({ where: { userId }, data: { lastSyncAt: new Date() } });
}
export async function classifyMessage(userId: string, messageId: string) {
  if (!(await running(userId))) return;
  const m = await db.employerMessage.findFirstOrThrow({ where: { id: messageId, userId } });
  if (m.category !== 'PENDING') return;
  const r = await llm(
    userId,
    'CLASSIFICATION',
    messageSchema,
    'Верни {category:VIEWED|REJECTION|INVITATION|MESSAGE|ASSIGNMENT|INTERVIEW|INFORMATION,priority:NORMAL|HIGH,reason:string,deadline:ISO datetime|null,technologies:string[],materials:URL[],screeningType:ASSIGNMENT|PERSONAL|UNKNOWN}. Для тестовых извлеки явно указанные технологии, ссылки и срок, если не уверен в сроке — null. Психологические, видео, наблюдение и личное выполнение имеют screeningType PERSONAL. Не отправляй ответы. Все тестовые, приглашения и собеседования требуют пользователя.',
    { text: m.text, currentTime: new Date().toISOString() },
  );
  const application = m.vacancyId
    ? await db.application.findUnique({
        where: { userId_vacancyId: { userId, vacancyId: m.vacancyId } },
        include: { vacancy: true },
      })
    : null;
  const title =
    r.category === 'ASSIGNMENT'
      ? r.screeningType === 'PERSONAL'
        ? 'Пройдите тест лично'
        : 'Получено тестовое задание'
      : r.category === 'INVITATION'
        ? 'Получено приглашение'
        : 'Новое сообщение работодателя';
  const details = [
    application ? `${application.vacancy.title} / ${application.vacancy.employer}` : '',
    m.text,
    r.deadline ? `Срок: ${r.deadline}` : '',
    r.technologies.length ? `Технологии: ${r.technologies.join(', ')}` : '',
    ...r.materials,
    m.vacancyId ? `https://hh.ru/vacancy/${encodeURIComponent(m.vacancyId)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const t = await task(
    userId,
    `message-${m.id}`,
    title,
    details,
    r.category === 'ASSIGNMENT'
      ? r.screeningType === 'PERSONAL'
        ? 'PERSONAL'
        : 'ASSIGNMENT'
      : 'MESSAGE',
    application?.id,
    r.deadline ? new Date(r.deadline) : undefined,
  );
  await db.userTask.update({ where: { id: t.id }, data: { priority: r.priority } });
  await notify(
    userId,
    `message-${m.id}`,
    'JobHunter AI — ' + title,
    details,
    r.category === 'INVITATION' ? 'INVITATION' : r.category === 'ASSIGNMENT' ? 'TASK' : 'MESSAGE',
    `/attention#task-${t.id}`,
  );
  await db.employerMessage.update({ where: { id: m.id }, data: { category: r.category } });
  await event(userId, 'MESSAGE', `Сообщение классифицировано: ${r.category}`, application?.id);
}
export async function scheduler() {
  const users = await db.appSettings.findMany({ where: { agentState: 'RUNNING' } });
  for (const s of users) {
    if (!activeHour(s.timezone, s.activeStart, s.activeEnd)) continue;
    const searches = await db.searchProfile.findMany({
      where: { userId: s.userId, active: true, nextScanAt: { lte: new Date() } },
    });
    for (const p of searches) {
      const claimed = await db.searchProfile.updateMany({
        where: { id: p.id, nextScanAt: { lte: new Date() } },
        data: { nextScanAt: new Date(Date.now() + p.intervalMinutes * 60000) },
      });
      if (claimed.count)
        await enqueue(
          'vacancy-scan',
          { userId: s.userId, searchId: p.id },
          `scan-${p.id}-${Math.floor(Date.now() / 60000)}`,
        );
    }
    const pending = await db.application.findMany({
      where: { userId: s.userId, status: { in: ['DISCOVERED', 'ANALYZING', 'READY_TO_APPLY'] } },
      select: { id: true, status: true },
      take: 100,
    });
    for (const a of pending) {
      const name = a.status === 'READY_TO_APPLY' ? 'cover-letter-generation' : 'vacancy-analysis';
      await enqueue(
        name,
        { userId: s.userId, applicationId: a.id },
        `recover-${a.id}-${Math.floor(Date.now() / 900000)}`,
      );
    }
    const messages = await db.employerMessage.findMany({
      where: { userId: s.userId, category: 'PENDING' },
      take: 100,
    });
    for (const m of messages)
      await enqueue(
        'message-classification',
        { userId: s.userId, messageId: m.id },
        `recover-msg-${m.id}-${Math.floor(Date.now() / 900000)}`,
      );
    if (!s.lastSyncAt || s.lastSyncAt.getTime() < Date.now() - 15 * 60000)
      await enqueue(
        'application-status-sync',
        { userId: s.userId },
        `sync-${s.userId}-${Math.floor(Date.now() / 900000)}`,
      );
  }
  const unsent = await db.notification.findMany({
    where: {
      status: { in: ['PENDING', 'UNCONFIGURED', 'FAILED'] },
      createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
      user: { settings: { smtpHost: { not: '' } } },
    },
    take: 100,
  });
  for (const n of unsent)
    await enqueue(
      'email-notification',
      { notificationId: n.id },
      `recover-mail-${n.id}-${Math.floor(Date.now() / 900000)}`,
    );
  const all = await db.appSettings.findMany();
  for (const s of all) {
    const date = localDate(s.timezone);
    const h = Number(
      new Intl.DateTimeFormat('en', {
        timeZone: s.timezone,
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(new Date()),
    );
    if (h < 20 || s.lastDigestDate === date) continue;
    const count = await db.application.count({
      where: { userId: s.userId, appliedAt: { gte: new Date(Date.now() - 86400000) } },
    });
    await notify(
      s.userId,
      `digest-${s.userId}-${date}`,
      'JobHunter AI — итоги дня',
      `Откликов за последние 24 часа: ${count}. Результаты основаны на сохранённой истории.`,
      'DIGEST',
      '/analytics',
    );
    await db.appSettings.update({ where: { userId: s.userId }, data: { lastDigestDate: date } });
  }
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
export function safeError(e: unknown) {
  if (e instanceof HhError) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) return 'Ошибка сохранения данных';
  return 'Задача не завершена. Проверьте настройки интеграции.';
}
