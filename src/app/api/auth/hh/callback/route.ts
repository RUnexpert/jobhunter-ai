import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireUser } from '@/server/auth';
import { db } from '@/lib/db';
import { hash, decrypt } from '@/lib/crypto';
import { exchangeToken, saveConnection } from '@/server/hh';
import { event } from '@/server/engine';
export async function GET(req: NextRequest) {
  const app = process.env.APP_URL ?? 'http://localhost:3000';
  try {
    const user = await requireUser();
    const c = await cookies(),
      state = req.nextUrl.searchParams.get('state'),
      code = req.nextUrl.searchParams.get('code');
    if (!state || !code || c.get('hh_state')?.value !== state) throw new Error('OAuth state');
    c.delete('hh_state');
    const attempt = await db.oAuthAttempt.delete({ where: { id: hash(state) } });
    if (attempt.userId !== user.id || attempt.expiresAt < new Date())
      throw new Error('OAuth expired');
    const t = await exchangeToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.HH_REDIRECT_URI ?? app + '/api/auth/hh/callback',
      code_verifier: decrypt(attempt.verifier),
    });
    await saveConnection(user.id, t);
    await event(user.id, 'HH', 'Аккаунт соискателя подключён через OAuth PKCE');
    return NextResponse.redirect(app + '/settings?hh=connected');
  } catch {
    return NextResponse.redirect(app + '/settings?hh=error');
  }
}
