import { z } from 'zod';
import { db } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import { HH_CAPABILITIES } from '@/lib/policy';
export class HhError extends Error {
  constructor(
    public status: number,
    public retryAfter = 0,
  ) {
    super(`hh.ru: HTTP ${status}`);
  }
}
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
const meSchema = z.object({ id: z.string(), is_applicant: z.boolean().optional() });
export const hhVacancySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    employer: z.object({ id: z.string().nullable().optional(), name: z.string() }).nullable(),
    description: z.string().default(''),
    salary: z
      .object({ from: z.number().nullable(), to: z.number().nullable(), currency: z.string() })
      .nullable()
      .optional(),
    salary_range: z
      .object({ from: z.number().nullable(), to: z.number().nullable(), currency: z.string() })
      .nullable()
      .optional(),
    work_format: z.array(z.object({ id: z.string() })).optional(),
    schedule: z.object({ id: z.string() }).nullable().optional(),
    alternate_url: z.string().url(),
    published_at: z.string(),
    archived: z.boolean().default(false),
    response_letter_required: z.boolean().default(false),
    has_test: z.boolean().default(false),
    response_url: z.string().nullable().optional(),
  })
  .strip();
export type HhVacancy = z.infer<typeof hhVacancySchema>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function hhRequest(
  path: string,
  token?: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Недопустимый путь hh.ru');
  for (let n = 0; n < attempts; n++) {
    let response: Response;
    try {
      response = await fetch(`https://api.hh.ru${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: {
          'HH-User-Agent': process.env.HH_USER_AGENT ?? 'JobHunterAI/1.0 (admin@example.com)',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        cache: 'no-store',
      });
    } catch {
      if (n === attempts - 1) throw new HhError(503);
      await sleep(500 * 2 ** n);
      continue;
    }
    if (response.ok) return response;
    const wait = Number(response.headers.get('retry-after') ?? 0);
    if ((response.status === 429 || response.status >= 500) && n < attempts - 1 && wait <= 15) {
      await sleep(Math.max(wait * 1000, 1000 * 2 ** n));
      continue;
    }
    throw new HhError(response.status, wait);
  }
  throw new HhError(503);
}
export async function exchangeToken(values: Record<string, string>) {
  const r = await hhRequest(
    '/token',
    undefined,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...values,
        client_id: process.env.HH_CLIENT_ID ?? '',
        client_secret: process.env.HH_CLIENT_SECRET ?? '',
      }),
    },
    1,
  );
  return tokenSchema.parse(await r.json());
}
export async function saveConnection(userId: string, t: z.infer<typeof tokenSchema>) {
  const me = meSchema.parse(await (await hhRequest('/me', t.access_token)).json());
  if (me.is_applicant !== true) throw new Error('Подключите аккаунт соискателя hh.ru');
  await db.hhAccount.upsert({
    where: { userId },
    create: {
      userId,
      externalId: me.id,
      accessToken: encrypt(t.access_token),
      refreshToken: encrypt(t.refresh_token),
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      capabilities: HH_CAPABILITIES,
    },
    update: {
      externalId: me.id,
      accessToken: encrypt(t.access_token),
      refreshToken: encrypt(t.refresh_token),
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      connected: true,
      capabilities: HH_CAPABILITIES,
    },
  });
}
export async function accountToken(userId: string) {
  // Row lock serializes one-use refresh tokens across web and worker processes.
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "HhAccount" WHERE "userId"=${userId} FOR UPDATE`;
      const a = await tx.hhAccount.findUnique({ where: { userId } });
      if (!a?.connected) throw new HhError(401);
      if (a.expiresAt.getTime() > Date.now()) return decrypt(a.accessToken);
      try {
        const t = await exchangeToken({
          grant_type: 'refresh_token',
          refresh_token: decrypt(a.refreshToken),
        });
        await tx.hhAccount.update({
          where: { userId },
          data: {
            accessToken: encrypt(t.access_token),
            refreshToken: encrypt(t.refresh_token),
            expiresAt: new Date(Date.now() + t.expires_in * 1000),
          },
        });
        return t.access_token;
      } catch (e) {
        throw e;
      }
    },
    { timeout: 30000 },
  );
}
async function reserveRequestSlot() {
  const interval = Math.min(5000, Math.max(500, Number(process.env.HH_REQUEST_INTERVAL_MS) || 500));
  const slots = await db.$queryRaw<{ expiresAt: Date }[]>`
    INSERT INTO "RateLimit" ("key","count","expiresAt")
    VALUES ('hh-request-slot',1,timezone('UTC',now())+${interval}*INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE
    SET "expiresAt"=GREATEST("RateLimit"."expiresAt",timezone('UTC',now()))+${interval}*INTERVAL '1 millisecond'
    WHERE "RateLimit"."expiresAt"<timezone('UTC',now())+INTERVAL '10 seconds'
    RETURNING "expiresAt"`;
  if (!slots.length) throw new HhError(429, 10);
  const wait = slots[0].expiresAt.getTime() - Date.now() - interval;
  if (wait > 0) await sleep(Math.min(wait, 10000));
}
export async function hhForUser(userId: string, path: string) {
  try {
    const token = await accountToken(userId);
    await reserveRequestSlot();
    const settings = await db.appSettings.findUniqueOrThrow({ where: { userId } });
    if (settings.agentState !== 'RUNNING') throw new HhError(409);
    return await hhRequest(path, token);
  } catch (e) {
    if (e instanceof HhError && [400, 401].includes(e.status)) {
      await db.hhAccount.updateMany({ where: { userId }, data: { connected: false } });
      await db.appSettings.update({ where: { userId }, data: { agentState: 'PAUSED' } });
      await db.userTask.upsert({
        where: { dedupeKey: `auth-${userId}` },
        create: {
          userId,
          dedupeKey: `auth-${userId}`,
          title: 'Подключите hh.ru повторно',
          description: 'Авторизация hh.ru недействительна. Агент приостановлен.',
          type: 'AUTH',
        },
        update: { completedAt: null },
      });
      await db.agentEvent.create({
        data: {
          userId,
          kind: 'HH_AUTH',
          message: 'Авторизация hh.ru недействительна. Агент приостановлен.',
        },
      });
      const { notify } = await import('./notifications');
      await notify(
        userId,
        `auth-${userId}-${Math.floor(Date.now() / 86400000)}`,
        'JobHunter AI — подключите hh.ru повторно',
        'Агент приостановлен из-за недействительной авторизации. Откройте настройки.',
        'AUTH',
        '/settings',
      );
    }
    throw e;
  }
}
export function normalizeVacancy(v: HhVacancy) {
  const s = v.salary_range ?? v.salary;
  const formats =
    v.work_format?.map((x) => x.id) ?? (v.schedule?.id === 'remote' ? ['REMOTE'] : []);
  return {
    id: v.id,
    title: v.name,
    employerId: v.employer?.id ?? `unknown:${v.id}`,
    employer: v.employer?.name ?? 'Работодатель не указан',
    salaryFrom: s?.from ?? null,
    salaryTo: s?.to ?? null,
    currency: s?.currency ?? null,
    workFormats: formats,
    description: v.description.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' '),
    url: `https://hh.ru/vacancy/${encodeURIComponent(v.id)}`,
    publishedAt: new Date(v.published_at),
    archived: v.archived,
    requiresLetter: v.response_letter_required,
    hasTest: v.has_test,
    externalResponse: !!v.response_url,
    raw: JSON.parse(
      JSON.stringify({
        id: v.id,
        name: v.name,
        employer: v.employer,
        salary: v.salary ?? null,
        salary_range: v.salary_range ?? null,
        work_format: v.work_format ?? [],
        schedule: v.schedule ?? null,
        published_at: v.published_at,
        archived: v.archived,
        response_letter_required: v.response_letter_required,
        has_test: v.has_test,
      }),
    ),
  };
}
export async function submitApplicant(): Promise<never> {
  throw new Error(
    'Официальная public OpenAPI не описывает отправку отклика соискателя. Завершите действие на hh.ru.',
  );
}
