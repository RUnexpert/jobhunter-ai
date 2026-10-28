import { defaultWeights, weightsSchema } from './schemas';
export function weightedScore(
  components: Record<keyof typeof defaultWeights, number>,
  weights: unknown,
) {
  const w = weightsSchema.parse(weights);
  return Math.round(
    (Object.keys(w) as (keyof typeof w)[]).reduce((s, k) => s + (w[k] * components[k]) / 100, 0),
  );
}
export function hardFilter(
  v: {
    archived: boolean;
    employerId: string;
    employer: string;
    salaryFrom: number | null;
    salaryTo: number | null;
    currency: string | null;
    workFormats: string[];
    title: string;
  },
  p: {
    blacklist: string[];
    exclude: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string;
    workFormat: string;
  },
  globalBlacklist: string[] = [],
) {
  if (v.archived) return 'Вакансия в архиве';
  if (
    [...p.blacklist, ...globalBlacklist].some((x) =>
      [v.employerId, v.employer.toLowerCase()].includes(x.toLowerCase()),
    )
  )
    return 'Работодатель в чёрном списке';
  if (p.exclude.some((x) => v.title.toLowerCase().includes(x.toLowerCase())))
    return 'Исключённое слово в названии';
  if (p.workFormat !== 'ANY' && !v.workFormats.includes(p.workFormat))
    return 'Формат работы не подтверждён или не подходит';
  if (p.salaryMin && v.currency && v.currency !== p.currency)
    return 'Валюта зарплаты отличается; требуется ручная проверка';
  if (
    p.salaryMin &&
    (v.salaryTo ?? v.salaryFrom) !== null &&
    (v.salaryTo ?? v.salaryFrom)! < p.salaryMin
  )
    return 'Зарплата ниже минимума';
  if (p.salaryMax && v.salaryFrom && v.salaryFrom > p.salaryMax)
    return 'Зарплата выше заданного диапазона';
  return null;
}
export function importSearch(link: string) {
  const u = new URL(link);
  if (
    u.protocol !== 'https:' ||
    !['hh.ru', 'www.hh.ru'].includes(u.hostname) ||
    u.pathname !== '/search/vacancy'
  )
    throw new Error('Нужна ссылка https://hh.ru/search/vacancy');
  const q = u.searchParams;
  return {
    query: q.get('text') ?? '',
    area: q.get('area') ?? '113',
    salaryMin: q.has('salary') ? Number(q.get('salary')) : null,
    currency: q.get('currency') ?? 'RUR',
    experience: q.get('experience') ?? '',
    schedule: q.get('schedule') ?? '',
    workFormat: q.get('work_format') ?? (q.get('schedule') === 'remote' ? 'REMOTE' : 'ANY'),
  };
}
export function csvCell(value: unknown) {
  const s = String(value ?? '');
  return (
    '"' + (/^[\s]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
  );
}
export function activeHour(timezone: string, start: number, end: number, at = new Date()) {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(at),
  );
  return h >= start && h < end;
}
export function localDate(timezone: string, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
export const HH_CAPABILITIES = {
  search: true,
  oauth: true,
  resumeSync: false,
  applicantSubmit: false,
  negotiationSync: false,
  chats: 'requires-account-access',
  checkedAt: '2026-10-27',
};
