import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { requireUser } from '@/server/auth';
import { db } from '@/lib/db';
import { encrypt, hash, randomToken } from '@/lib/crypto';
export async function GET() {
  try {
    const user = await requireUser();
    if (!process.env.HH_CLIENT_ID || !process.env.HH_CLIENT_SECRET)
      return NextResponse.json(
        { error: 'Настройте HH_CLIENT_ID и HH_CLIENT_SECRET' },
        { status: 503 },
      );
    const state = randomToken(),
      verifier = randomToken();
    await db.oAuthAttempt.create({
      data: {
        id: hash(state),
        userId: user.id,
        verifier: encrypt(verifier),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    (await cookies()).set('hh_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.APP_URL?.startsWith('https:'),
      maxAge: 600,
      path: '/api/auth/hh',
    });
    const url = new URL('https://hh.ru/oauth/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.HH_CLIENT_ID,
      redirect_uri: process.env.HH_REDIRECT_URI ?? `${process.env.APP_URL}/api/auth/hh/callback`,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      role: 'applicant',
      force_role: 'true',
    }).toString();
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ error: 'Войдите в JobHunter AI' }, { status: 401 });
  }
}
