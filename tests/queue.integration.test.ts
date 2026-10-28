import { afterAll, expect, it } from 'vitest';
import { Worker } from 'bullmq';
import { enqueue, queue, redisConnection } from '@/server/queue';
let worker: Worker | undefined;
afterAll(async () => {
  await worker?.close();
  await queue('vacancy-analysis').close();
});
it('BullMQ сохраняет job ID, ограниченно повторяет и восстанавливает работу worker', async () => {
  if (new URL(process.env.REDIS_URL!).port !== '56379')
    throw new Error('Use isolated test Redis on port 56379');
  let calls = 0;
  const id = `integration-${Date.now()}`;
  const job = await enqueue('vacancy-analysis', { test: true }, id);
  await enqueue('vacancy-analysis', { test: true }, id);
  expect((await queue('vacancy-analysis').getJob(id))?.id).toBe(id);
  worker = new Worker(
    'vacancy-analysis',
    async (j) => {
      if (j.id !== id) return;
      calls++;
      if (calls === 1) throw new Error('Controlled transient failure');
      return 'ok';
    },
    { connection: redisConnection(), concurrency: 1 },
  );
  for (let n = 0; n < 200; n++) {
    if ((await job.getState()) === 'completed') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(await job.getState()).toBe('completed');
  expect(calls).toBe(2);
  await worker.close();
  worker = undefined;
  const resumed = await enqueue('vacancy-analysis', { test: true }, id + '-restart');
  worker = new Worker('vacancy-analysis', async () => 'recovered', {
    connection: redisConnection(),
    concurrency: 1,
  });
  for (let n = 0; n < 100; n++) {
    if ((await resumed.getState()) === 'completed') break;
    await new Promise((r) => setTimeout(r, 20));
  }
  expect(await resumed.getState()).toBe('completed');
  await job.remove();
  await resumed.remove();
}, 20000);
