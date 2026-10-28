import { Queue } from 'bullmq';
export const queueNames = [
  'vacancy-scan',
  'vacancy-analysis',
  'cover-letter-generation',
  'application-submit',
  'application-status-sync',
  'message-classification',
  'email-notification',
] as const;
export type QueueName = (typeof queueNames)[number];
export function redisConnection() {
  const u = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    username: u.username || undefined,
    db: Number(u.pathname.slice(1) || 0),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
const queues = new Map<QueueName, Queue>();
export function queue(name: QueueName) {
  if (!queues.has(name))
    queues.set(
      name,
      new Queue(name, {
        connection: { ...redisConnection(), maxRetriesPerRequest: 1, connectTimeout: 5000 },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 1000 },
        },
      }),
    );
  return queues.get(name)!;
}
export async function enqueue(name: QueueName, data: Record<string, unknown>, id?: string) {
  const counts = await queue(name).getJobCounts('wait', 'delayed', 'active');
  if (Object.values(counts).reduce((a, b) => a + b, 0) >= 10000)
    throw new Error('Очередь заполнена. Повторите позже.');
  return queue(name).add(name, data, { ...(id ? { jobId: id } : {}) });
}
