import { validateAiUrl } from '@/server/ai';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  activeHour,
  csvCell,
  hardFilter,
  HH_CAPABILITIES,
  importSearch,
  weightedScore,
} from '@/lib/policy';
import { analysisSchema, defaultWeights, searchSchema, screeningSchema } from '@/lib/schemas';
import { decrypt, encrypt, updatedSecret } from '@/lib/crypto';
import { escapeHtml } from '@/server/notifications';
const vacancy = {
  archived: false,
  employerId: '123',
  employer: 'Example',
  salaryFrom: 200000,
  salaryTo: 300000,
  currency: 'RUR',
  workFormats: ['REMOTE'],
  title: 'React developer',
};
const profile = {
  blacklist: [],
  exclude: [],
  salaryMin: 220000,
  salaryMax: null,
  currency: 'RUR',
  workFormat: 'REMOTE',
};
describe('Политика поиска', () => {
  it('считает взвешенный рейтинг на сервере', () =>
    expect(
      weightedScore(
        { stack: 100, experience: 80, salary: 60, format: 100, duties: 80, preferences: 100 },
        defaultWeights,
      ),
    ).toBe(86));
  it('отклоняет произвольную сумму весов', () =>
    expect(() =>
      weightedScore(
        { stack: 100, experience: 80, salary: 60, format: 100, duties: 80, preferences: 100 },
        { ...defaultWeights, stack: 99 },
      ),
    ).toThrow());
  it('применяет обязательные ограничения прежде рейтинга', () => {
    expect(hardFilter({ ...vacancy, salaryTo: 210000 }, profile)).toMatch(/ниже/);
    expect(hardFilter({ ...vacancy, workFormats: [] }, profile)).toMatch(/Формат/);
    expect(hardFilter(vacancy, profile, ['123'])).toMatch(/чёрном/);
    expect(hardFilter({ ...vacancy, archived: true }, profile)).toMatch(/архив/);
  });
  it('не считает различную валюту эквивалентной', () =>
    expect(hardFilter({ ...vacancy, currency: 'USD' }, profile)).toMatch(/Валюта/));
  it('допускает диапазон с достижимым минимумом', () =>
    expect(hardFilter(vacancy, profile)).toBeNull());
  it('импортирует только разрешённый URL и известные параметры', () => {
    expect(
      importSearch('https://hh.ru/search/vacancy?text=React&salary=200000&schedule=remote'),
    ).toMatchObject({ query: 'React', salaryMin: 200000, workFormat: 'REMOTE' });
    expect(() => importSearch('https://evil.example/search/vacancy')).toThrow();
  });
  it('не заявляет неподтверждённые возможности API', () => {
    expect(HH_CAPABILITIES.applicantSubmit).toBe(false);
    expect(HH_CAPABILITIES.resumeSync).toBe(false);
  });
  it('учитывает часы в часовом поясе пользователя', () => {
    expect(activeHour('Europe/Moscow', 9, 19, new Date('2026-10-27T07:00:00Z'))).toBe(true);
    expect(activeHour('Europe/Moscow', 9, 19, new Date('2026-10-27T20:00:00Z'))).toBe(false);
  });
  it('отклоняет слишком частую проверку и профиль без резюме', () => {
    expect(
      searchSchema.safeParse({
        name: 'React',
        query: 'React',
        resumeIds: ['r'],
        intervalMinutes: 1,
      }).success,
    ).toBe(false);
    expect(searchSchema.safeParse({ name: 'React', query: 'React', resumeIds: [] }).success).toBe(
      false,
    );
  });
  it('проверяет неуверенный и повреждённый JSON AI', () => {
    expect(analysisSchema.safeParse({ matchScore: 999 }).success).toBe(false);
    expect(screeningSchema.safeParse({ category: 'RUN_CODE' }).success).toBe(false);
  });
});
describe('Секреты и экспорт', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });
  it('шифрует с уникальным IV и проверяет подлинность', () => {
    const a = encrypt('secret'),
      b = encrypt('secret');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('secret');
    const p = a.split('.');
    p[1] = Buffer.alloc(16).toString('base64url');
    expect(() => decrypt(p.join('.'))).toThrow();
  });
  it('не переносит сохранённый секрет на другой сервер', () => {
    expect(updatedSecret(undefined, false)).toBeNull();
    expect(updatedSecret('', true)).toBeUndefined();
    expect(decrypt(updatedSecret('new-secret', false)!)).toBe('new-secret');
  });
  it('без ключа не сохраняет открытые секреты', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('secret')).toThrow();
  });
  it('экранирует HTML из сообщений', () =>
    expect(escapeHtml('<script>"&')).toBe('&lt;script&gt;&quot;&amp;'));
  it('блокирует формулы в CSV и сохраняет кавычки', () => {
    expect(csvCell('=CMD()')).toBe('"\'=CMD()"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});

it('разрешает HTTP только явно заданному локальному AI', async () => {
  const previous = process.env.AI_ALLOWED_HOSTS;
  process.env.AI_ALLOWED_HOSTS = 'api.openai.com,ollama';
  try {
    await expect(validateAiUrl('http://api.openai.com/v1')).rejects.toThrow('HTTPS');
    await expect(validateAiUrl('http://ollama:11434/v1')).resolves.toBeInstanceOf(URL);
  } finally {
    if (previous === undefined) delete process.env.AI_ALLOWED_HOSTS;
    else process.env.AI_ALLOWED_HOSTS = previous;
  }
});
