import { expect, it } from 'vitest';
import { readJson } from '@/lib/http';
it('декодирует Unicode JSON и требует объект', async () => {
  expect(
    await readJson(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ text: 'Опыт React' }),
      }),
    ),
  ).toEqual({ text: 'Опыт React' });
  await expect(
    readJson(new Request('http://localhost', { method: 'POST', body: 'null' })),
  ).rejects.toMatchObject({ status: 400 });
});
it('отклоняет объявленный большой payload до чтения', async () => {
  await expect(
    readJson(
      new Request('http://localhost', {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Length': '999999' },
      }),
    ),
  ).rejects.toMatchObject({ status: 413 });
});
it('останавливает поток без Content-Length при превышении лимита', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(150001));
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request('http://localhost', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit);
  await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
  expect(cancelled).toBe(true);
});
it('отклоняет повреждённый UTF-8', async () => {
  await expect(
    readJson(new Request('http://localhost', { method: 'POST', body: new Uint8Array([0xff]) })),
  ).rejects.toMatchObject({ status: 400 });
});
