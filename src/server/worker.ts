import { Worker } from 'bullmq';
import { db } from '@/lib/db';
import { queueNames, redisConnection } from './queue';
import {
  scan,
  analyze,
  generateLetter,
  prepareApplication,
  syncMessages,
  classifyMessage,
  scheduler,
  event,
  safeError,
  task,
} from './engine';
import { deliverEmail } from './notifications';
try {
  process.loadEnvFile('.env');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
}
const workers = queueNames.map((name) => {
  const worker = new Worker(
    name,
    async (job) => {
      const d = job.data as {
        userId: string;
        searchId: string;
        applicationId: string;
        messageId: string;
        notificationId: string;
      };
      switch (name) {
        case 'vacancy-scan':
          return scan(d.userId, d.searchId);
        case 'vacancy-analysis':
          return analyze(d.userId, d.applicationId);
        case 'cover-letter-generation':
          return generateLetter(d.userId, d.applicationId);
        case 'application-submit':
          return prepareApplication(d.userId, d.applicationId);
        case 'application-status-sync':
          return syncMessages(d.userId);
        case 'message-classification':
          return classifyMessage(d.userId, d.messageId);
        case 'email-notification':
          return deliverEmail(d.notificationId);
      }
    },
    {
      connection: redisConnection(),
      concurrency: name === 'application-submit' ? 1 : 2,
      limiter: { max: 10, duration: 1000 },
    },
  );
  worker.on('failed', (job, error) => {
    if (job?.data.userId)
      void (async () => {
        await event(job.data.userId, 'ERROR', `${name}: ${safeError(error)}`);
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
          await task(
            job.data.userId,
            `failed-${name}-${job.id}`,
            'Фоновая задача не завершена',
            `${name}: ${safeError(error)}`,
            'ERROR',
            job.data.applicationId,
          );
          if (job.data.applicationId)
            await db.application.updateMany({
              where: {
                id: job.data.applicationId,
                userId: job.data.userId,
                status: { in: ['DISCOVERED', 'ANALYZING', 'READY_TO_APPLY'] },
              },
              data: { status: 'FAILED', error: safeError(error) },
            });
        }
      })().catch(() => process.stderr.write('Could not persist worker failure\n'));
  });
  worker.on('error', () => process.stderr.write('Worker connection error\n'));
  return worker;
});
let ticking = false;
const timer = setInterval(() => {
  if (ticking) return;
  ticking = true;
  scheduler()
    .catch(() => process.stderr.write('Scheduler error\n'))
    .finally(() => {
      ticking = false;
    });
}, 30000);
void scheduler().catch(() => process.stderr.write('Scheduler startup error\n'));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    clearInterval(timer);
    await Promise.all(workers.map((w) => w.close()));
    await db.$disconnect();
    process.exit(0);
  });
