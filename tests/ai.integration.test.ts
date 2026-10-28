import { createServer, type Server } from 'node:http';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { z } from 'zod';
import { db } from '@/lib/db';
import { llm } from '@/server/ai';
let server: Server,
  userId: string,
  port: number,
  calls = 0,
  mode = 'ok';
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Test database required');
  process.env.AI_ALLOWED_HOSTS = '127.0.0.1';
  server = createServer((req, res) => {
    calls++;
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      if (parsed.messages.some((m: { content: string }) => m.content.includes('secret-key')))
        throw new Error('Secret leaked');
      if (mode === 'error') {
        res.writeHead(503);
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ message: { content: mode === 'bad' ? 'not json' : '{"ok":true}' } }],
          ...(mode !== 'no-usage' ? { usage: { prompt_tokens: 30, completion_tokens: 5 } } : {}),
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
  const u = await db.user.create({
    data: { email: `ai-integration-${Date.now()}@test.invalid`, passwordHash: 'unused' },
  });
  userId = u.id;
  await db.aIProviderConfig.create({
    data: {
      userId,
      purpose: 'ANALYSIS',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'controlled-test-model',
      inputPrice: 0.01,
      outputPrice: 0.01,
      dailyBudget: 1,
    },
  });
});
beforeEach(() => {
  calls = 0;
  mode = 'ok';
});
afterAll(async () => {
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
  await new Promise<void>((r) => server.close(() => r()));
});
describe('Настоящий HTTP OpenAI-совместимого провайдера', () => {
  it('проверяет JSON и сохраняет usage', async () => {
    expect(
      await llm(userId, 'ANALYSIS', z.object({ ok: z.literal(true) }), 'JSON only', {}),
    ).toEqual({ ok: true });
    const u = await db.aIUsage.findFirstOrThrow({
      where: { config: { userId } },
      orderBy: { createdAt: 'desc' },
    });
    expect(u.inputTokens).toBe(30);
    expect(u.reservedCost).toBe(0);
  });
  it('оставляет резерв при неизвестном usage', async () => {
    mode = 'no-usage';
    await llm(userId, 'ANALYSIS', z.object({ ok: z.literal(true) }), 'JSON only', {});
    const u = await db.aIUsage.findFirstOrThrow({
      where: { config: { userId } },
      orderBy: { createdAt: 'desc' },
    });
    expect(u.reservedCost).toBeGreaterThan(0);
  });
  it('останавливается после двух невалидных ответов', async () => {
    mode = 'bad';
    await expect(
      llm(userId, 'ANALYSIS', z.object({ ok: z.literal(true) }), 'JSON only', {}),
    ).rejects.toThrow(/двух/);
    expect(calls).toBe(2);
  });
  it('обрабатывает недоступность API с ограниченными повторами', async () => {
    mode = 'error';
    await expect(
      llm(userId, 'ANALYSIS', z.object({ ok: z.literal(true) }), 'JSON only', {}),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });
  it('лимит бюджета применяется до HTTP-запроса', async () => {
    await db.aIProviderConfig.update({
      where: { userId_purpose: { userId, purpose: 'ANALYSIS' } },
      data: { dailyBudget: 0 },
    });
    await expect(
      llm(userId, 'ANALYSIS', z.object({ ok: z.literal(true) }), 'JSON only', {}),
    ).rejects.toThrow(/бюджет/);
    expect(calls).toBe(0);
  });
});
