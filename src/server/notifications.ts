import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { enqueue } from './queue';
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export async function notify(
  userId: string,
  key: string,
  subject: string,
  body: string,
  type = 'TASK',
  path = '/attention',
) {
  const settings = await db.appSettings.findUniqueOrThrow({ where: { userId } });
  if (!settings.notificationTypes.includes(type)) return;
  const n = await db.notification.upsert({
    where: { dedupeKey: key },
    create: { userId, dedupeKey: key, subject, body, path },
    update: {},
  });
  if (n.status !== 'SENT') await enqueue('email-notification', { notificationId: n.id }, n.id);
}
export async function deliverEmail(notificationId: string) {
  const n = await db.notification.findUniqueOrThrow({
    where: { id: notificationId },
    include: { user: { include: { settings: true } } },
  });
  if (n.status === 'SENT') return;
  const s = n.user.settings!;
  if (!s.smtpHost || !s.smtpFrom) {
    await db.notification.update({
      where: { id: n.id },
      data: {
        status: 'UNCONFIGURED',
        error: 'Настройте SMTP. Уведомление сохранено в приложении.',
      },
    });
    return;
  }
  const allowed = (process.env.SMTP_ALLOWED_HOSTS ?? '').split(',').map((x) => x.trim());
  if (!allowed.includes(s.smtpHost)) throw new Error('SMTP host не разрешён администратором');
  const transport = nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpPort === 465,
    requireTLS: s.smtpTls,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: s.smtpUser
      ? { user: s.smtpUser, pass: s.smtpSecret ? decrypt(s.smtpSecret) : '' }
      : undefined,
  });
  const url = new URL(n.path, process.env.APP_URL ?? 'http://localhost:3000').href;
  await db.notification.update({ where: { id: n.id }, data: { status: 'SENDING' } });
  try {
    await transport.sendMail({
      messageId: `<${n.id}@jobhunter.local>`,
      from: s.smtpFrom,
      to: n.user.email,
      subject: n.subject,
      text: n.body + '\n' + url,
      html: `<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width"><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172338"><div style="max-width:600px;margin:24px auto;padding:28px;background:white;border-radius:12px"><strong style="color:#335cff">JobHunter AI</strong><h1 style="font-size:22px">${escapeHtml(n.subject)}</h1><p style="line-height:1.7;white-space:pre-line">${escapeHtml(n.body)}</p><a style="display:inline-block;background:#335cff;color:white;padding:12px 20px;border-radius:8px" href="${escapeHtml(url)}">Открыть JobHunter AI</a></div></body></html>`,
    });
    await db.notification.update({
      where: { id: n.id },
      data: { status: 'SENT', sentAt: new Date(), error: null },
    });
  } catch {
    await db.notification.update({
      where: { id: n.id },
      data: { status: 'FAILED', error: 'SMTP не подтвердил доставку' },
    });
    throw new Error('Ошибка SMTP');
  }
}
