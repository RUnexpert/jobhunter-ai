import { readJson as body } from '@/lib/http';
import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { compare, hash as passwordHash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { updatedSecret } from '@/lib/crypto';
import { HH_CAPABILITIES, csvCell, importSearch } from '@/lib/policy';
import {
  candidateSchema,
  providerSchema,
  resumeSchema,
  searchSchema,
  settingsSchema,
} from '@/lib/schemas';
import {
  ApiError,
  authRateLimit,
  createSession,
  logout,
  originGuard,
  rateLimit,
  requireUser,
} from '@/server/auth';
import { enqueue, redisConnection } from '@/server/queue';
import { checkProvider, validateAiUrl, llm } from '@/server/ai';
import { classifyQuestion, confirmManualApplication, event, generateLetter } from '@/server/engine';
import { notify } from '@/server/notifications';
import { HhError } from '@/server/hh';
import IORedis from 'ioredis';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const authSchema = z.object({
  email: z
    .string()
    .email()
    .max(320)
    .transform((x) => x.toLowerCase()),
  password: z
    .string()
    .min(12)
    .max(72)
    .refine(
      (v) => Buffer.byteLength(v, 'utf8') <= 72,
      'Пароль должен занимать не более 72 байт UTF-8',
    ),
  inviteCode: z.string().optional(),
});
async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    originGuard(req);
    const { path } = await params;
    const route = path.join('/'),
      method = req.method;
    if (route === 'health' && method === 'GET') {
      await db.$queryRaw`SELECT 1`;
      const redis = new IORedis({
        ...redisConnection(),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
      });
      try {
        await redis.ping();
      } finally {
        redis.disconnect();
      }
      return NextResponse.json({ ok: true });
    }
    if (['auth/login', 'auth/register'].includes(route) && method === 'POST') {
      const data = authSchema.parse(await body(req));
      await authRateLimit(req, data.email);
      let user = await db.user.findUnique({ where: { email: data.email } });
      if (route === 'auth/register') {
        if (!process.env.REGISTRATION_CODE || data.inviteCode !== process.env.REGISTRATION_CODE)
          throw new ApiError(403, 'Для регистрации нужен код владельца сервера');
        if (user) throw new ApiError(400, 'Не удалось зарегистрировать аккаунт');
        user = await db.user.create({
          data: {
            email: data.email,
            passwordHash: await passwordHash(data.password, 12),
            settings: { create: {} },
            profile: { create: {} },
          },
        });
      } else if (!user || !(await compare(data.password, user.passwordHash)))
        throw new ApiError(401, 'Неверная почта или пароль');
      await createSession(user.id);
      return NextResponse.json({ ok: true });
    }
    const user = await requireUser();
    const userId = user.id;
    if (method !== 'GET') await rateLimit(`write-${userId}`, 120, 60000);
    if (route === 'auth/logout' && method === 'POST') {
      await logout();
      return NextResponse.json({ ok: true });
    }
    if (route === 'me') return NextResponse.json({ id: user.id, email: user.email });
    if (route === 'events' && method === 'GET') {
      let timer: ReturnType<typeof setInterval> | undefined;
      let busy = false;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          let last = '';
          timer = setInterval(async () => {
            if (busy) return;
            busy = true;
            try {
              const latest = await db.agentEvent.findFirst({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
              });
              if (latest?.id !== last) {
                last = latest?.id ?? '';
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ refresh: true })}\n\n`),
                );
              } else controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } catch {
              clearInterval(timer);
              try {
                controller.close();
              } catch {}
            } finally {
              busy = false;
            }
          }, 5000);
          req.signal.addEventListener('abort', () => {
            clearInterval(timer);
            try {
              controller.close();
            } catch {}
          });
        },
        cancel() {
          clearInterval(timer);
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    if (route === 'dashboard' || route === 'analytics') {
      const applications = await db.application.findMany({
        where: { userId },
        include: {
          vacancy: true,
          analysis: true,
          search: { select: { name: true, minScore: true } },
          resume: { select: { title: true } },
          letter: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      });
      const tasks = await db.userTask.count({ where: { userId, completedAt: null } }),
        profiles = await db.searchProfile.count({ where: { userId, active: true } }),
        settings = await db.appSettings.findUniqueOrThrow({ where: { userId } }),
        account = await db.hhAccount.findUnique({
          where: { userId },
          select: { connected: true, expiresAt: true, capabilities: true },
        }),
        last = await db.searchProfile.findFirst({
          where: { userId, lastScanAt: { not: null } },
          orderBy: { lastScanAt: 'desc' },
          select: { lastScanAt: true },
        });
      const kpi = {
        found: applications.length,
        analyzed: applications.filter((a) => a.analysis).length,
        matched: applications.filter(
          (a) => (a.analysis?.score ?? 0) >= a.search.minScore && a.analysis?.decision === 'apply',
        ).length,
        applied: applications.filter((a) => a.appliedAt).length,
        viewed: applications.filter((a) =>
          ['VIEWED', 'INVITATION', 'INTERVIEW', 'OFFER'].includes(a.pipeline),
        ).length,
        invited: applications.filter((a) =>
          ['INVITATION', 'INTERVIEW', 'OFFER'].includes(a.pipeline),
        ).length,
        rejected: applications.filter((a) => a.pipeline === 'REJECTED').length,
        attention: tasks,
      };
      const resumeCount = await db.resume.count({ where: { userId } });
      const usage = await db.aIUsage.aggregate({
        where: { config: { userId } },
        _sum: { inputTokens: true, outputTokens: true, estimatedCost: true, reservedCost: true },
      });
      return NextResponse.json({
        kpi,
        profiles,
        resumeCount,
        agentState: settings.agentState,
        dryRun: settings.dryRun,
        account,
        lastScanAt: last?.lastScanAt,
        capabilities: HH_CAPABILITIES,
        applications,
        usage: usage._sum,
        truncated: applications.length === 10000,
      });
    }
    if (route === 'analytics/recommendations' && method === 'POST') {
      const rows = await db.application.findMany({
        where: { userId, appliedAt: { not: null } },
        include: { search: { select: { name: true } } },
        take: 50000,
      });
      const stats = Object.values(
        rows.reduce<Record<string, { id: string; name: string; total: number; invited: number }>>(
          (acc, a) => {
            const r = (acc[a.searchId] ??= {
              id: a.searchId,
              name: a.search.name,
              total: 0,
              invited: 0,
            });
            r.total++;
            if (['INVITATION', 'INTERVIEW', 'OFFER'].includes(a.pipeline)) r.invited++;
            return acc;
          },
          {},
        ),
      ).filter((g) => g.total >= 30);
      if (stats.length < 2)
        throw new ApiError(
          409,
          'Для рекомендаций нужно минимум два профиля с 30 откликами в каждом',
        );
      const result = await llm(
        userId,
        'ANALYSIS',
        z.object({
          recommendations: z
            .array(
              z.object({
                text: z.string().min(1).max(2000),
                profileIds: z.array(z.string()).min(2),
                sampleSize: z.number().int().min(60),
              }),
            )
            .min(1)
            .max(3),
        }),
        'На основе только переданных агрегатов предложи осторожные изменения стратегии поиска. JSON {recommendations:[{text,profileIds:string[],sampleSize:number}]}. Для каждого вывода укажи минимум два существующих profileIds и sampleSize — точную сумму total этих профилей. Не делай причинных выводов, не утверждай статистическую значимость. Различия наблюдаемые, данные сообщены пользователем. При отсутствии убедительного различия рекомендуй продолжить сбор данных.',
        { stats },
      );
      for (const r of result.recommendations) {
        if (
          new Set(r.profileIds).size !== r.profileIds.length ||
          r.profileIds.some((id) => !stats.some((g) => g.id === id)) ||
          r.sampleSize !==
            stats.filter((g) => r.profileIds.includes(g.id)).reduce((n, g) => n + g.total, 0)
        )
          throw new ApiError(422, 'AI не подтвердил выборку рекомендаций');
      }
      await event(userId, 'AI_RECOMMENDATIONS', JSON.stringify(result));
      return NextResponse.json(result);
    }
    if (route === 'search-profiles') {
      if (method === 'GET')
        return NextResponse.json(
          await db.searchProfile.findMany({
            where: { userId },
            include: { resumes: true },
            orderBy: { createdAt: 'asc' },
          }),
        );
      if (method === 'POST') {
        if ((await db.searchProfile.count({ where: { userId } })) >= 30)
          throw new ApiError(400, 'Допускается не более 30 поисковых профилей');
        const { resumeIds, ...data } = searchSchema.parse(await body(req));
        if (
          (await db.resume.count({ where: { id: { in: resumeIds }, userId } })) !==
          new Set(resumeIds).size
        )
          throw new ApiError(400, 'Резюме не найдено');
        const p = await db.searchProfile.create({
          data: {
            ...data,
            userId,
            resumes: { create: resumeIds.map((resumeId) => ({ resumeId })) },
          },
        });
        await event(userId, 'PROFILE', `Создан профиль «${p.name}»`);
        return NextResponse.json(p);
      }
    }
    if (path[0] === 'search-profiles' && path[1]) {
      const p = await db.searchProfile.findFirstOrThrow({ where: { id: path[1], userId } });
      if (method === 'PATCH') {
        const input = await body(req);
        if (Object.keys(input).length === 1 && typeof input.active === 'boolean') {
          return NextResponse.json(
            await db.searchProfile.update({ where: { id: p.id }, data: { active: input.active } }),
          );
        }
        const { resumeIds, ...data } = searchSchema.parse(input);
        if (
          (await db.resume.count({ where: { userId, id: { in: resumeIds } } })) !==
          new Set(resumeIds).size
        )
          throw new ApiError(400, 'Резюме не найдено');
        return NextResponse.json(
          await db.searchProfile.update({
            where: { id: p.id },
            data: {
              ...data,
              resumes: { deleteMany: {}, create: resumeIds.map((resumeId) => ({ resumeId })) },
            },
          }),
        );
      }
    }
    if (route === 'import-search' && method === 'POST') {
      const input = z.object({ url: z.string().url() }).parse(await body(req));
      return NextResponse.json(importSearch(input.url));
    }
    if (route === 'resumes') {
      if (method === 'GET')
        return NextResponse.json(
          await db.resume.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
        );
      if (method === 'POST')
        return NextResponse.json(
          await db.resume.create({ data: { ...resumeSchema.parse(await body(req)), userId } }),
        );
    }
    if (path[0] === 'resumes' && path[1] && method === 'PATCH') {
      await db.resume.findFirstOrThrow({ where: { userId, id: path[1] } });
      return NextResponse.json(
        await db.resume.update({
          where: { id: path[1] },
          data: resumeSchema.parse(await body(req)),
        }),
      );
    }
    if (route === 'candidate') {
      if (method === 'GET')
        return NextResponse.json(
          await db.candidateProfile.findUnique({ where: { userId }, include: { skills: true } }),
        );
      if (method === 'PUT') {
        const { skills, ...data } = candidateSchema.parse(await body(req));
        return NextResponse.json(
          await db.candidateProfile.upsert({
            where: { userId },
            create: { ...data, userId, skills: { create: skills } },
            update: { ...data, skills: { deleteMany: {}, create: skills } },
          }),
        );
      }
    }
    if (route === 'applications' || route === 'vacancies') {
      const q = req.nextUrl.searchParams;
      const filter = q.get('q') ?? '';
      const min = Number(q.get('score') ?? 0);
      const salaryFilter = z.coerce
        .number()
        .nonnegative()
        .max(1000000000)
        .parse(q.get('salary') ?? 0);
      const since = q.get('since');
      if (
        since &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(new Date(since).getTime()))
      )
        throw new ApiError(400, 'Неверная дата');
      if (!Number.isFinite(min) || min < 0 || min > 100)
        throw new ApiError(400, 'Неверный рейтинг');
      const where: Prisma.ApplicationWhereInput = {
        userId,
        ...(filter
          ? {
              vacancy: {
                OR: [
                  { title: { contains: filter, mode: 'insensitive' } },
                  { employer: { contains: filter, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
        ...(q.get('status')
          ? {
              status: z
                .enum([
                  'DISCOVERED',
                  'ANALYZING',
                  'READY_TO_APPLY',
                  'AWAITING_APPROVAL',
                  'APPLYING',
                  'APPLIED',
                  'FAILED',
                  'SKIPPED',
                  'REQUIRES_USER_ACTION',
                ])
                .parse(q.get('status')),
            }
          : {}),
        ...(q.get('profile') ? { searchId: q.get('profile')! } : {}),
        ...(min ? { analysis: { score: { gte: min } } } : {}),
        AND: [
          ...(salaryFilter
            ? [
                {
                  vacancy: {
                    OR: [
                      { salaryTo: { gte: salaryFilter } },
                      { salaryFrom: { gte: salaryFilter } },
                    ],
                  },
                },
              ]
            : []),
          ...(since ? [{ vacancy: { publishedAt: { gte: new Date(since) } } }] : []),
        ],
      };
      return NextResponse.json(
        await db.application.findMany({
          where,
          include: {
            vacancy: true,
            analysis: true,
            letter: true,
            resume: true,
            search: true,
            questions: { include: { answer: true } },
            events: { orderBy: { createdAt: 'desc' }, take: 30 },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );
    }
    if (path[0] === 'applications' && path[1] && method === 'POST') {
      const a = await db.application.findFirstOrThrow({ where: { id: path[1], userId } });
      const action = path[2],
        input = await body(req);
      if (action === 'confirm') {
        const s = z.object({ confirmed: z.literal(true) }).parse(input);
        void s;
        await confirmManualApplication(userId, a.id);
      } else if (action === 'retry') {
        if (a.appliedAt) throw new ApiError(409, 'Отправленный отклик не перезапускается');
        const settings = await db.appSettings.findUniqueOrThrow({ where: { userId } });
        if (settings.agentState !== 'RUNNING')
          throw new ApiError(409, 'Запустите агента перед повторной обработкой');
        await db.application.update({
          where: { id: a.id },
          data: { status: 'DISCOVERED', error: null },
        });
        await enqueue(
          'vacancy-analysis',
          { userId, applicationId: a.id },
          `retry-${a.id}-${Date.now()}`,
        );
      } else if (action === 'skip') {
        if (a.appliedAt) throw new ApiError(409, 'Отправленный отклик нельзя пропустить');
        await db.application.update({ where: { id: a.id }, data: { status: 'SKIPPED' } });
      } else if (action === 'letter') {
        if (input.text !== undefined) {
          const text = z.string().min(1).max(10000).parse(input.text);
          await db.coverLetter.upsert({
            where: { applicationId: a.id },
            create: { applicationId: a.id, text, factIds: [] },
            update: { text },
          });
          await event(userId, 'LETTER_EDIT', 'Письмо отредактировано пользователем', a.id);
        } else if ((await generateLetter(userId, a.id, true)) === false)
          throw new ApiError(
            422,
            'AI не подготовил проверенное письмо. Создана задача для ручной проверки.',
          );
      } else if (action === 'question') {
        await classifyQuestion(userId, a.id, z.string().min(3).max(15000).parse(input.text));
      } else if (action === 'feedback') {
        await db.application.update({
          where: { id: a.id },
          data: { feedback: z.string().min(3).max(2000).parse(input.text) },
        });
      } else if (action === 'pipeline') {
        const pipeline = z
          .enum([
            'SENT',
            'VIEWED',
            'INVITATION',
            'ASSIGNMENT',
            'REJECTED',
            'ARCHIVE',
            'INTERVIEW',
            'OFFER',
          ])
          .parse(input.pipeline);
        if (!a.appliedAt) throw new ApiError(409, 'Сначала подтвердите реальный отклик');
        await db.application.update({
          where: { id: a.id },
          data: {
            pipeline,
            resultSource: 'USER_REPORTED',
            ...(['INVITATION', 'REJECTED', 'INTERVIEW', 'OFFER'].includes(pipeline) &&
            !a.respondedAt
              ? { respondedAt: new Date() }
              : {}),
          },
        });
      } else if (action === 'blacklist') {
        const v = await db.vacancy.findUniqueOrThrow({ where: { id: a.vacancyId } });
        await db.appSettings.update({
          where: { userId },
          data: { blacklist: { push: v.employerId } },
        });
      } else throw new ApiError(404, 'Действие не найдено');
      await event(userId, 'USER_ACTION', `Действие: ${action}`, a.id);
      return NextResponse.json({
        ok: true,
        ...(action === 'letter'
          ? { letter: await db.coverLetter.findUnique({ where: { applicationId: a.id } }) }
          : {}),
      });
    }
    if (route === 'tasks')
      return NextResponse.json(
        await db.userTask.findMany({
          where: { userId },
          include: { application: { include: { vacancy: true } } },
          orderBy: [{ completedAt: 'asc' }, { createdAt: 'desc' }],
          take: 500,
        }),
      );
    if (path[0] === 'tasks' && path[1] && method === 'PATCH') {
      await db.userTask.findFirstOrThrow({ where: { id: path[1], userId } });
      return NextResponse.json(
        await db.userTask.update({ where: { id: path[1] }, data: { completedAt: new Date() } }),
      );
    }
    if (route === 'activity')
      return NextResponse.json(
        await db.agentEvent.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      );
    if (route === 'notifications')
      return NextResponse.json(
        await db.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
    if (route === 'providers') {
      if (method === 'GET') {
        const providers = await db.aIProviderConfig.findMany({ where: { userId } });
        return NextResponse.json(providers.map(({ apiKey, ...p }) => ({ ...p, hasKey: !!apiKey })));
      }
      if (method === 'PUT') {
        const { apiKey, ...data } = providerSchema.parse(await body(req));
        await validateAiUrl(data.baseUrl);
        return NextResponse.json(
          await db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
            const previous = await tx.aIProviderConfig.findUnique({
              where: { userId_purpose: { userId, purpose: data.purpose } },
            });
            const secret = updatedSecret(
              apiKey,
              previous?.baseUrl === data.baseUrl && previous?.provider === data.provider,
            );
            return tx.aIProviderConfig.upsert({
              where: { userId_purpose: { userId, purpose: data.purpose } },
              create: { ...data, userId, apiKey: secret ?? null },
              update: { ...data, ...(secret !== undefined ? { apiKey: secret } : {}) },
              select: { id: true },
            });
          }),
        );
      }
    }
    if (route === 'providers/test' && method === 'POST') {
      const input = z
        .object({ purpose: z.enum(['ANALYSIS', 'LETTER', 'CLASSIFICATION', 'SCREENING']) })
        .parse(await body(req));
      await checkProvider(userId, input.purpose);
      return NextResponse.json({ ok: true });
    }
    if (route === 'settings') {
      if (method === 'GET') {
        const { smtpSecret, ...settings } = await db.appSettings.findUniqueOrThrow({
          where: { userId },
        });
        return NextResponse.json({ ...settings, hasSmtpSecret: !!smtpSecret });
      }
      if (method === 'PUT') {
        const { smtpSecret, ...data } = settingsSchema.parse(await body(req));
        if (
          data.smtpHost &&
          !(process.env.SMTP_ALLOWED_HOSTS ?? '').split(',').includes(data.smtpHost)
        )
          throw new ApiError(400, 'SMTP host не разрешён в SMTP_ALLOWED_HOSTS');
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
          const previous = await tx.appSettings.findUniqueOrThrow({ where: { userId } });
          const secret = updatedSecret(
            smtpSecret,
            previous.smtpHost === data.smtpHost &&
              previous.smtpUser === data.smtpUser &&
              previous.smtpPort === data.smtpPort,
          );
          await tx.appSettings.update({
            where: { userId },
            data: { ...data, ...(secret !== undefined ? { smtpSecret: secret } : {}) },
          });
        });
        await event(userId, 'SETTINGS', 'Настройки сохранены');
        return NextResponse.json({ ok: true });
      }
    }
    if (route === 'agent' && method === 'POST') {
      const { action } = z
        .object({ action: z.enum(['START', 'PAUSE', 'STOP', 'SCAN']) })
        .parse(await body(req));
      if (action === 'SCAN') {
        const s = await db.appSettings.findUniqueOrThrow({ where: { userId } });
        if (s.agentState !== 'RUNNING') throw new ApiError(409, 'Сначала запустите агента');
        const profiles = await db.searchProfile.findMany({ where: { userId, active: true } });
        for (const p of profiles)
          await enqueue(
            'vacancy-scan',
            { userId, searchId: p.id },
            `manual-${p.id}-${Math.floor(Date.now() / 60000)}`,
          );
      } else {
        if (action === 'START') {
          const account = await db.hhAccount.findUnique({ where: { userId } });
          if (!account?.connected) throw new ApiError(409, 'Сначала подключите hh.ru в настройках');
          if (!(await db.searchProfile.count({ where: { userId, active: true } })))
            throw new ApiError(409, 'Создайте хотя бы один активный поисковый профиль');
          if (
            !(await db.aIProviderConfig.findUnique({
              where: { userId_purpose: { userId, purpose: 'ANALYSIS' } },
            }))
          )
            throw new ApiError(409, 'Настройте AI для анализа вакансий');
        }
        const state = action === 'START' ? 'RUNNING' : action === 'PAUSE' ? 'PAUSED' : 'STOPPED';
        await db.appSettings.update({ where: { userId }, data: { agentState: state } });
        if (action === 'START') {
          // Re-enqueue durable unfinished records so work skipped during pause is recovered.
          const pending = await db.application.findMany({
            where: { userId, status: { in: ['DISCOVERED', 'ANALYZING', 'READY_TO_APPLY'] } },
          });
          for (const a of pending)
            await enqueue(
              a.status === 'READY_TO_APPLY' ? 'cover-letter-generation' : 'vacancy-analysis',
              { userId, applicationId: a.id },
              `resume-${a.id}-${Date.now()}`,
            );
        } else
          await notify(
            userId,
            `pause-${userId}-${Date.now()}`,
            'JobHunter AI — агент остановлен',
            'Новые действия агента остановлены.',
            'PAUSE',
          );
      }
      await event(userId, 'AGENT', `Команда агенту: ${action}`);
      return NextResponse.json({ ok: true });
    }
    if (route === 'hh/disconnect' && method === 'POST') {
      await db.$transaction([
        db.hhAccount.deleteMany({ where: { userId } }),
        db.appSettings.update({ where: { userId }, data: { agentState: 'STOPPED' } }),
      ]);
      await event(
        userId,
        'HH',
        'Аккаунт отключён. Отозвать доступ приложения можно также на hh.ru.',
      );
      return NextResponse.json({ ok: true });
    }
    if (route === 'export') {
      const rows = await db.application.findMany({
        where: { userId },
        include: { vacancy: true, analysis: true, search: true },
        take: 50000,
      });
      const csv =
        '\ufeff' +
        [
          [
            'Вакансия',
            'Компания',
            'Профиль',
            'Статус',
            'Рейтинг',
            'Дата отклика',
            'Источник',
            'Ссылка',
          ],
          ...rows.map((a) => [
            a.vacancy.title,
            a.vacancy.employer,
            a.search.name,
            a.status,
            a.analysis?.score,
            a.appliedAt?.toISOString(),
            a.resultSource,
            a.vacancy.url,
          ]),
        ]
          .map((r) => r.map(csvCell).join(','))
          .join('\r\n');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="jobhunter-applications.csv"',
        },
      });
    }
    if (route === 'openapi') return NextResponse.json((await import('@/server/openapi')).spec);
    throw new ApiError(404, 'Маршрут не найден');
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError)
      return NextResponse.json(
        { error: e.issues.map((x) => x.path.join('.') + ': ' + x.message).join('; ') },
        { status: 400 },
      );
    if (e instanceof Prisma.PrismaClientKnownRequestError)
      return NextResponse.json(
        { error: e.code === 'P2002' ? 'Такая запись уже существует' : 'Запись недоступна' },
        { status: e.code === 'P2002' ? 409 : 404 },
      );
    if (e instanceof HhError) return NextResponse.json({ error: e.message }, { status: 502 });
    return NextResponse.json(
      { error: 'Не удалось выполнить операцию. Проверьте настройки и доступность сервисов.' },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
