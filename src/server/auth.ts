import { ApiError } from '@/lib/errors';
export { ApiError } from '@/lib/errors';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { hash, randomToken } from '@/lib/crypto';
import { NextRequest } from 'next/server';
export function originGuard(req: Request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (!origin || origin !== new URL(process.env.APP_URL ?? 'http://localhost:3000').origin)
      throw new ApiError(403, 'Недопустимый источник запроса');
  }
}
export async function requireUser() {
  const token = (await cookies()).get('jh_session')?.value;
  if (!token) throw new ApiError(401, 'Войдите в аккаунт');
  const session = await db.session.findUnique({
    where: { id: hash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) throw new ApiError(401, 'Сессия истекла');
  return session.user;
}
export async function createSession(userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + 7 * 86400000);
  await db.session.create({ data: { id: hash(token), userId, expiresAt: expires } });
  (await cookies()).set('jh_session', token, {
    httpOnly: true,
    secure: new URL(process.env.APP_URL ?? 'http://localhost:3000').protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}
export async function logout() {
  const c = await cookies(),
    token = c.get('jh_session')?.value;
  if (token) await db.session.deleteMany({ where: { id: hash(token) } });
  c.delete('jh_session');
}
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const bucket = String(Math.floor(Date.now() / windowMs));
  const r = await db.rateLimit.upsert({
    where: { key: hash(key + bucket) },
    create: { key: hash(key + bucket), expiresAt: new Date(Date.now() + windowMs * 2) },
    update: { count: { increment: 1 } },
  });
  if (r.count > limit) throw new ApiError(429, 'Слишком много запросов. Повторите позже.');
}
export async function authRateLimit(req: NextRequest, email: string) {
  await rateLimit(`auth-email:${email.toLowerCase()}`, 10, 900000);
  await rateLimit('auth-global', 100, 900000);
  void req;
}
