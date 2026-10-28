import { beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import { accountToken, hhForUser } from '@/server/hh';
vi.mock('@/server/notifications', () => ({ notify: vi.fn(async () => {}) }));
let userId: string;
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Test database required');
  process.env.ENCRYPTION_KEY = 'b'.repeat(64);
  userId = (
    await db.user.create({
      data: {
        email: `oauth-${Date.now()}@test.invalid`,
        passwordHash: 'unused',
        settings: { create: { agentState: 'RUNNING' } },
      },
    })
  ).id;
  await db.hhAccount.create({
    data: {
      userId,
      externalId: crypto.randomUUID(),
      accessToken: encrypt('expired-access'),
      refreshToken: encrypt('one-use-refresh'),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});
it('одновременно обновляет одноразовый refresh только один раз', async () => {
  const f = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      ),
  );
  vi.stubGlobal('fetch', f);
  expect(await Promise.all([accountToken(userId), accountToken(userId)])).toEqual([
    'new-access',
    'new-access',
  ]);
  expect(f).toHaveBeenCalledTimes(1);
  const a = await db.hhAccount.findUniqueOrThrow({ where: { userId } });
  expect(decrypt(a.refreshToken)).toBe('new-refresh');
  expect(a.accessToken).not.toContain('new-access');
});
it('401 отзывает локальное подключение и ставит агента на паузу', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 401 })),
  );
  await expect(hhForUser(userId, '/me')).rejects.toMatchObject({ status: 401 });
  expect((await db.hhAccount.findUniqueOrThrow({ where: { userId } })).connected).toBe(false);
  expect((await db.appSettings.findUniqueOrThrow({ where: { userId } })).agentState).toBe('PAUSED');
});
