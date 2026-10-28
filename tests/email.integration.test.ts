import { createServer, type Server } from 'node:net';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { deliverEmail } from '@/server/notifications';
let server: Server, userId: string, notificationId: string;
const messages: string[] = [];
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Test database required');
  process.env.SMTP_ALLOWED_HOSTS = '127.0.0.1';
  server = createServer((socket) => {
    socket.write('220 localhost test SMTP\r\n');
    let input = '',
      data = false;
    socket.on('data', (chunk) => {
      input += chunk.toString();
      while (true) {
        if (data) {
          const end = input.indexOf('\r\n.\r\n');
          if (end < 0) return;
          messages.push(input.slice(0, end));
          input = input.slice(end + 5);
          data = false;
          socket.write('250 accepted\r\n');
          continue;
        }
        const end = input.indexOf('\r\n');
        if (end < 0) return;
        const line = input.slice(0, end);
        input = input.slice(end + 2);
        if (line.startsWith('DATA')) {
          data = true;
          socket.write('354 send data\r\n');
        } else if (line.startsWith('QUIT')) {
          socket.end('221 bye\r\n');
          return;
        } else socket.write('250 localhost\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  userId = (
    await db.user.create({
      data: {
        email: `email-${Date.now()}@test.invalid`,
        passwordHash: 'unused',
        settings: {
          create: {
            smtpHost: '127.0.0.1',
            smtpPort: port,
            smtpTls: false,
            smtpFrom: 'noreply@test.invalid',
          },
        },
      },
    })
  ).id;
  notificationId = (
    await db.notification.create({
      data: {
        userId,
        dedupeKey: crypto.randomUUID(),
        subject: 'JobHunter test',
        body: 'Вакансия React <script>bad</script>',
        path: '/attention',
      },
    })
  ).id;
});
afterAll(async () => {
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
  await new Promise<void>((r) => server.close(() => r()));
});
it('отправляет адаптивный HTML через реальный локальный SMTP и пропускает SENT', async () => {
  await deliverEmail(notificationId);
  await deliverEmail(notificationId);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain('multipart/alternative');
  expect(messages[0]).toContain('JobHunter test');
  expect((await db.notification.findUniqueOrThrow({ where: { id: notificationId } })).status).toBe(
    'SENT',
  );
});
