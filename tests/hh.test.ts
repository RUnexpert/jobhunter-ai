import { describe, expect, it, vi, afterEach } from 'vitest';
import { hhRequest, hhVacancySchema, normalizeVacancy, submitApplicant } from '@/server/hh';
afterEach(() => vi.unstubAllGlobals());
describe('hh.ru adapter', () => {
  it('не повторяет 401/403', async () => {
    const f = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', f);
    await expect(hhRequest('/me', 'secret')).rejects.toMatchObject({ status: 403 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('уважает длинный Retry-After без горячего цикла', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
    vi.stubGlobal('fetch', f);
    await expect(hhRequest('/vacancies')).rejects.toMatchObject({ status: 429, retryAfter: 120 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('ограничивает повторы серверной ошибки', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', f);
    const pending = expect(hhRequest('/vacancies')).rejects.toMatchObject({ status: 500 });
    await vi.runAllTimersAsync();
    await pending;
    expect(f).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
  it('ограничивает сетевые ошибки', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', f);
    await expect(hhRequest('/me', undefined, {}, 1)).rejects.toMatchObject({ status: 503 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('использует только фиксированный API origin и запрещает редиректы', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', f);
    await hhRequest('/me', 'secret');
    expect(f.mock.calls[0][0]).toBe('https://api.hh.ru/me');
    expect(f.mock.calls[0][1].redirect).toBe('error');
    await expect(hhRequest('//evil.example')).rejects.toThrow();
  });
  it('не вызывает недокументированную отправку', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(submitApplicant()).rejects.toThrow(/OpenAPI/);
    expect(f).not.toHaveBeenCalled();
  });
  it('сохраняет описание как текст и формирует безопасную ссылку', () => {
    const v = normalizeVacancy(
      hhVacancySchema.parse({
        id: '1',
        name: 'React',
        employer: null,
        description: '<script>alert(1)</script><p>React</p>',
        secret_candidate_info: 'private-info',
        alternate_url: 'https://evil.example/',
        published_at: '2026-10-27T10:00:00Z',
      }),
    );
    expect(v.url).toBe('https://hh.ru/vacancy/1');
    expect(v.description).not.toContain('<script>');
    expect(v.raw).not.toHaveProperty('secret_candidate_info');
    expect(v.raw).not.toHaveProperty('response_url');
  });
});
