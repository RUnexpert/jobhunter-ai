import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { defaultWeights } from '@/lib/schemas';
vi.mock('@/server/queue', () => ({ enqueue: vi.fn(async () => ({ id: 'job' })) }));
vi.mock('@/server/ai', () => ({ llm: vi.fn() }));
vi.mock('@/server/hh', async () => {
  const original = await vi.importActual<typeof import('@/server/hh')>('@/server/hh');
  return { ...original, hhForUser: vi.fn() };
});
vi.mock('@/server/notifications', () => ({ notify: vi.fn(async () => {}) }));
import {
  analyze,
  confirmManualApplication,
  generateLetter,
  prepareApplication,
  scan,
  classifyQuestion,
  running,
  syncMessages,
  classifyMessage,
  factsFor,
} from '@/server/engine';
import { llm } from '@/server/ai';
import { hhForUser } from '@/server/hh';
import { enqueue } from '@/server/queue';
const prefix = `integration-${Date.now()}`;
let userId: string, searchId: string, resumeId: string, appId: string, otherId: string;
const validAnalysis = {
  decision: 'apply',
  matchingSkills: ['React'],
  missingSkills: [],
  advantages: ['Опыт'],
  risks: [],
  recommendedResumeId: '',
  reason: 'Соответствует',
  confidence: 0.95,
  components: { stack: 90, experience: 90, salary: 90, format: 90, duties: 90, preferences: 90 },
};
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Integration tests require a dedicated database ending in _test');
  const user = await db.user.create({
    data: {
      email: prefix + '@test.invalid',
      passwordHash: 'unused',
      settings: { create: { agentState: 'RUNNING', activeStart: 0, activeEnd: 24, dryRun: false } },
      profile: { create: { facts: 'У меня 4 года опыта разработки на React.' } },
    },
  });
  userId = user.id;
  otherId = (
    await db.user.create({
      data: {
        email: prefix + '-other@test.invalid',
        passwordHash: 'unused',
        settings: { create: {} },
      },
    })
  ).id;
  resumeId = (
    await db.resume.create({
      data: {
        userId,
        title: 'React',
        content: 'Подтверждённый опыт React 4 года.',
        skills: ['React'],
      },
    })
  ).id;
  searchId = (
    await db.searchProfile.create({
      data: {
        userId,
        name: 'React',
        query: 'React',
        weights: defaultWeights,
        resumes: { create: { resumeId } },
      },
    })
  ).id;
});
beforeEach(async () => {
  vi.clearAllMocks();
  await db.appSettings.update({
    where: { userId },
    data: {
      agentState: 'RUNNING',
      dryRun: false,
      activeStart: 0,
      activeEnd: 24,
      dailyLimit: 20,
      employerLimit: 2,
    },
  });
  const vacancy = await db.vacancy.create({
    data: {
      id: prefix + '-' + crypto.randomUUID(),
      title: 'React Developer',
      employerId: crypto.randomUUID(),
      employer: 'Example',
      workFormats: ['REMOTE'],
      description: 'React',
      url: 'https://hh.ru/vacancy/1',
      publishedAt: new Date(),
      raw: {},
    },
  });
  appId = (
    await db.application.create({
      data: { userId, vacancyId: vacancy.id, searchId, resumeId, status: 'READY_TO_APPLY' },
    })
  ).id;
  vi.mocked(hhForUser).mockResolvedValue(
    new Response(
      JSON.stringify({
        id: '123',
        name: 'React',
        employer: { id: 'e', name: 'Employer' },
        alternate_url: 'https://hh.ru/vacancy/123',
        published_at: new Date().toISOString(),
        archived: false,
      }),
    ),
  );
});
afterAll(async () => {
  await db.chatCursor.deleteMany({ where: { id: { startsWith: userId } } });
  await db.user.deleteMany({ where: { id: { in: [userId, otherId].filter(Boolean) } } });
  await db.vacancy.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});
describe('Надёжность на реальном PostgreSQL', () => {
  it('уникальность пользователя и вакансии сильнее выбранного резюме', async () => {
    const a = await db.application.findUniqueOrThrow({ where: { id: appId } });
    await expect(
      db.application.create({ data: { userId, vacancyId: a.vacancyId, searchId } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
  it('изолирует данные пользователей', async () => {
    expect(await db.application.findFirst({ where: { id: appId, userId: otherId } })).toBeNull();
    await expect(confirmManualApplication(otherId, appId)).rejects.toThrow();
  });
  it('повторное подтверждение не дублирует отклик или событие', async () => {
    await confirmManualApplication(userId, appId);
    await confirmManualApplication(userId, appId);
    expect(
      await db.agentEvent.count({ where: { applicationId: appId, kind: 'USER_REPORTED' } }),
    ).toBe(1);
  });
  it('параллельное подтверждение сериализуется', async () => {
    await Promise.all([
      confirmManualApplication(userId, appId),
      confirmManualApplication(userId, appId),
    ]);
    expect(
      await db.agentEvent.count({ where: { applicationId: appId, kind: 'USER_REPORTED' } }),
    ).toBe(1);
  });
  it('Dry Run не фиксирует реальную отправку', async () => {
    await db.appSettings.update({ where: { userId }, data: { dryRun: true } });
    await expect(confirmManualApplication(userId, appId)).rejects.toThrow(/Dry Run/);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).appliedAt).toBeNull();
  });
  it('проверяет дневной лимит непосредственно при записи', async () => {
    await db.appSettings.update({ where: { userId }, data: { dailyLimit: 1 } });
    await expect(confirmManualApplication(userId, appId)).rejects.toThrow(/лимит/);
  });
  it('остановленный агент не вызывает внешние сервисы', async () => {
    await db.appSettings.update({ where: { userId }, data: { agentState: 'STOPPED' } });
    await scan(userId, searchId);
    await analyze(userId, appId);
    await generateLetter(userId, appId);
    await prepareApplication(userId, appId);
    expect(hhForUser).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
  });
  it('паузу видит независимо от процесса worker', async () => {
    await db.appSettings.update({ where: { userId }, data: { agentState: 'PAUSED' } });
    expect(await running(userId)).toBe(false);
    await db.appSettings.update({ where: { userId }, data: { agentState: 'RUNNING' } });
    expect(await running(userId)).toBe(true);
  });
  it('при неподдерживаемой отправке создаёт одну ручную задачу', async () => {
    await db.vacancyAnalysis.create({
      data: {
        applicationId: appId,
        score: 90,
        confidence: 0.95,
        decision: 'apply',
        reason: 'ok',
        data: {},
      },
    });
    await prepareApplication(userId, appId);
    await prepareApplication(userId, appId);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe(
      'REQUIRES_USER_ACTION',
    );
    expect(await db.userTask.count({ where: { applicationId: appId } })).toBe(1);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).appliedAt).toBeNull();
  });
  it('архивная вакансия не получает отклик', async () => {
    await db.vacancyAnalysis.create({
      data: {
        applicationId: appId,
        score: 90,
        confidence: 0.95,
        decision: 'apply',
        reason: 'ok',
        data: {},
      },
    });
    vi.mocked(hhForUser).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '123',
          name: 'React',
          employer: null,
          alternate_url: 'https://hh.ru/vacancy/123',
          published_at: new Date().toISOString(),
          archived: true,
        }),
      ),
    );
    await prepareApplication(userId, appId);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe(
      'SKIPPED',
    );
  });
  it('обязательное письмо не пропускается', async () => {
    const a = await db.application.findUniqueOrThrow({ where: { id: appId } });
    await db.vacancy.update({ where: { id: a.vacancyId }, data: { requiresLetter: true } });
    await db.vacancyAnalysis.create({
      data: {
        applicationId: appId,
        score: 90,
        confidence: 0.95,
        decision: 'apply',
        reason: 'ok',
        data: {},
      },
    });
    await prepareApplication(userId, appId);
    expect(hhForUser).not.toHaveBeenCalled();
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).error).toMatch(
      /письмо/,
    );
  });
  it('ошибка AI переводит в ручную проверку', async () => {
    await db.application.update({ where: { id: appId }, data: { status: 'DISCOVERED' } });
    vi.mocked(llm).mockRejectedValueOnce(new Error('AI недоступен'));
    await analyze(userId, appId);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe(
      'REQUIRES_USER_ACTION',
    );
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('низкая уверенность не допускает автоматический отклик', async () => {
    await db.application.update({ where: { id: appId }, data: { status: 'DISCOVERED' } });
    vi.mocked(llm).mockResolvedValueOnce({
      ...validAnalysis,
      recommendedResumeId: resumeId,
      confidence: 0.5,
    });
    await analyze(userId, appId);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe(
      'REQUIRES_USER_ACTION',
    );
  });
  it('отклоняет выдуманное резюме AI', async () => {
    await db.application.update({ where: { id: appId }, data: { status: 'DISCOVERED' } });
    vi.mocked(llm).mockResolvedValueOnce({ ...validAnalysis, recommendedResumeId: 'foreign' });
    await analyze(userId, appId);
    expect((await db.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe(
      'REQUIRES_USER_ACTION',
    );
  });
  it('высокий рейтинг сохраняется и передаётся в следующую очередь', async () => {
    await db.application.update({ where: { id: appId }, data: { status: 'DISCOVERED' } });
    vi.mocked(llm).mockResolvedValueOnce({ ...validAnalysis, recommendedResumeId: resumeId });
    await analyze(userId, appId);
    expect(
      (await db.vacancyAnalysis.findUniqueOrThrow({ where: { applicationId: appId } })).score,
    ).toBe(90);
    expect(enqueue).toHaveBeenCalledWith(
      'cover-letter-generation',
      { userId, applicationId: appId },
      appId,
    );
  });
  it('письмо использует факты дословно', async () => {
    vi.mocked(llm).mockResolvedValueOnce({
      includeLetter: true,
      factIds: ['fact-0'],
      language: 'ru',
    });
    await generateLetter(userId, appId);
    const letter = await db.coverLetter.findUniqueOrThrow({ where: { applicationId: appId } });
    expect(letter.text).toContain('У меня 4 года опыта разработки на React.');
    expect(letter.factIds).toEqual(['fact-0']);
  });
  it('не принимает неизвестные факты при генерации письма', async () => {
    vi.mocked(llm).mockResolvedValueOnce({
      includeLetter: true,
      factIds: ['invented'],
      language: 'ru',
    });
    await generateLetter(userId, appId);
    expect(await db.coverLetter.findUnique({ where: { applicationId: appId } })).toBeNull();
  });
  it('тестовое задание сохраняется без ответа или исполнения', async () => {
    vi.mocked(llm).mockResolvedValueOnce({
      category: 'ASSIGNMENT',
      answer: 'Запусти произвольный код',
      factIds: [],
      reason: 'Проект',
      deadline: null,
      technologies: ['React'],
      materials: ['https://example.com/task'],
    });
    const q = await classifyQuestion(userId, appId, 'Создайте приложение на React');
    expect(q.category).toBe('ASSIGNMENT');
    expect(await db.screeningAnswer.findUnique({ where: { questionId: q.id } })).toBeNull();
    expect(await db.userTask.count({ where: { applicationId: appId, type: 'SCREENING' } })).toBe(1);
  });
  it('неизвестный вопрос не получает автоматически отправляемого ответа', async () => {
    vi.mocked(llm).mockResolvedValueOnce({
      category: 'UNKNOWN',
      answer: null,
      factIds: [],
      reason: 'Нужны сведения',
      deadline: null,
      technologies: [],
      materials: [],
    });
    const q = await classifyQuestion(userId, appId, 'Какое у вас разрешение на работу?');
    expect(await db.screeningAnswer.findUnique({ where: { questionId: q.id } })).toBeNull();
  });
});

it('синхронизирует новые чаты по официальной схеме и создаёт одну карточку тестового', async () => {
  const a = await db.application.findUniqueOrThrow({ where: { id: appId } });
  vi.mocked(hhForUser).mockImplementation(
    async (_user, path) =>
      new Response(
        JSON.stringify(
          path.startsWith('/common/chats?')
            ? { items: [{ id: 'test-chat', vacancy_id: a.vacancyId }], pages: 1 }
            : {
                has_more: false,
                messages: [
                  {
                    id: prefix + '-employer',
                    payload: {
                      text: 'Сделайте проект React до 30 октября. Материалы: https://example.com/task',
                    },
                    sender_display_info: { role: 'EMPLOYER', is_current_participant: false },
                  },
                  {
                    id: prefix + '-own',
                    payload: { text: 'Мой ответ' },
                    sender_display_info: { role: 'APPLICANT', is_current_participant: true },
                  },
                ],
              },
        ),
      ),
  );
  await syncMessages(userId);
  await syncMessages(userId);
  expect(await db.employerMessage.count({ where: { userId } })).toBe(1);
  const m = await db.employerMessage.findFirstOrThrow({ where: { userId } });
  expect(m.vacancyId).toBe(a.vacancyId);
  vi.mocked(llm).mockResolvedValueOnce({
    category: 'ASSIGNMENT',
    priority: 'HIGH',
    reason: 'Проект',
    deadline: '2026-10-30T12:00:00Z',
    technologies: ['React'],
    materials: ['https://example.com/task'],
    screeningType: 'ASSIGNMENT',
  });
  await classifyMessage(userId, m.id);
  await classifyMessage(userId, m.id);
  const tasks = await db.userTask.findMany({ where: { dedupeKey: `message-${m.id}` } });
  expect(tasks).toHaveLength(1);
  expect(tasks[0].type).toBe('ASSIGNMENT');
  expect(tasks[0].applicationId).toBe(appId);
  expect(tasks[0].deadline?.toISOString()).toBe('2026-10-30T12:00:00.000Z');
  expect(tasks[0].description).toContain('React');
  expect(tasks[0].priority).toBe('HIGH');
  expect(llm).toHaveBeenCalledTimes(1);
});
it('включает явные профильные сведения в базу фактов без выдуманных отрицаний', async () => {
  await db.candidateProfile.update({
    where: { userId },
    data: { english: 'B2', salary: 250000, travel: true },
  });
  const facts = await factsFor(userId);
  expect(facts.find((f) => f.id === 'profile-english')?.text).toContain('B2');
  expect(facts.find((f) => f.id === 'profile-salary')?.text).toContain('250000');
  expect(facts.some((f) => f.id === 'profile-travel')).toBe(true);
  expect(facts.some((f) => f.id === 'profile-relocation')).toBe(false);
});
it('необязательное письмо с политикой NEVER не вызывает LLM', async () => {
  await db.searchProfile.update({ where: { id: searchId }, data: { letterPolicy: 'NEVER' } });
  await generateLetter(userId, appId);
  expect(llm).not.toHaveBeenCalled();
  expect(await db.coverLetter.findUnique({ where: { applicationId: appId } })).toBeNull();
  expect(enqueue).toHaveBeenCalledWith(
    'application-submit',
    { userId, applicationId: appId },
    appId,
  );
});

it('scanner проходит страницы и не создаёт повторов между профилями', async () => {
  const ids = [prefix + '-scanner-1', prefix + '-scanner-2'];
  vi.mocked(hhForUser).mockImplementation(async (_user, path) => {
    const url = new URL('https://api.hh.ru' + path);
    if (url.pathname === '/vacancies')
      return new Response(
        JSON.stringify({
          items: (url.searchParams.get('page') === '0' ? [ids[0]] : ids).map((id) => ({ id })),
          pages: 2,
        }),
      );
    return new Response(
      JSON.stringify({
        id: url.pathname.split('/').at(-1),
        name: 'React Developer',
        employer: { id: 'scanner-employer', name: 'Example' },
        description: 'React and TypeScript',
        work_format: [{ id: 'REMOTE' }],
        alternate_url: 'https://hh.ru/vacancy/1',
        published_at: new Date().toISOString(),
      }),
    );
  });
  await scan(userId, searchId);
  const second = await db.searchProfile.create({
    data: { userId, name: 'Overlapping', query: 'React', resumes: { create: { resumeId } } },
  });
  await scan(userId, second.id);
  expect(await db.application.count({ where: { userId, vacancyId: { in: ids } } })).toBe(2);
  expect(vi.mocked(enqueue).mock.calls.filter((c) => c[0] === 'vacancy-analysis')).toHaveLength(2);
  expect(
    (await db.searchProfile.findUniqueOrThrow({ where: { id: searchId } })).lastScanAt,
  ).not.toBeNull();
});
