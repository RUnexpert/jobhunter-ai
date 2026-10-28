'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Save, ExternalLink, ShieldCheck, Sparkles, CheckCircle2, Link2 } from 'lucide-react';
import { searchSchema, defaultWeights } from '@/lib/schemas';
import { api } from './workspace';
import { Button } from './ui/button';
import type { Resume, Search, Settings } from './types';
const split = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
function ErrorText({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label>
      {label}
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
export function SearchForm({ initial, onDone }: { initial?: Search; onDone: () => void }) {
  const qc = useQueryClient(),
    resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api<Resume[]>('resumes') });
  const [link, setLink] = useState(''),
    [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<z.input<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      name: initial?.name ?? '',
      query: initial?.query ?? '',
      active: initial?.active ?? true,
      area: String(initial?.area ?? '113'),
      currency: (initial?.currency as 'RUR') ?? 'RUR',
      salaryMin: (initial?.salaryMin as number | null) ?? null,
      salaryMax: (initial?.salaryMax as number | null) ?? null,
      workFormat: (initial?.workFormat as 'REMOTE') ?? 'REMOTE',
      employment: String(initial?.employment ?? 'full'),
      schedule: String(initial?.schedule ?? ''),
      experience: String(initial?.experience ?? ''),
      minScore: initial?.minScore ?? 75,
      dailyLimit: initial?.dailyLimit ?? 10,
      intervalMinutes: initial?.intervalMinutes ?? 60,
      mode: (initial?.mode as 'APPROVAL') ?? 'APPROVAL',
      letterPolicy: (initial?.letterPolicy as 'AI') ?? 'AI',
      resumeIds: initial?.resumes.map((r) => r.resumeId) ?? [],
      exclude: (initial?.exclude as string[]) ?? [],
      blacklist: (initial?.blacklist as string[]) ?? [],
      whitelist: (initial?.whitelist as string[]) ?? [],
      weights: (initial?.weights as typeof defaultWeights) ?? defaultWeights,
    },
  });
  async function submit(data: z.input<typeof searchSchema>) {
    setError('');
    try {
      await api(
        'search-profiles' + (initial ? '/' + initial.id : ''),
        initial ? 'PATCH' : 'POST',
        data,
      );
      await qc.invalidateQueries();
      toast.success('Профиль сохранён');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form className="form-stack" onSubmit={handleSubmit(submit)}>
      <div className="import-row">
        <input
          aria-label="Ссылка поиска hh.ru"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://hh.ru/search/vacancy?text=…"
        />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              const values = await api<Record<string, unknown>>('import-search', 'POST', {
                url: link,
              });
              for (const [k, v] of Object.entries(values))
                setValue(k as keyof z.input<typeof searchSchema>, v as never);
              toast.success('Параметры импортированы');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Link2 size={15} />
          Импорт
        </Button>
      </div>
      <div className="form-grid">
        <Field label="Название профиля">
          <input {...register('name')} placeholder="React Developer" required />
        </Field>
        <Field label="Поисковый запрос">
          <input {...register('query')} placeholder="React TypeScript" required />
        </Field>
        <Field label="Регион (ID hh.ru)" hint="113 — Россия, 1 — Москва">
          <input {...register('area')} />
        </Field>
        <Field label="Валюта">
          <select {...register('currency')}>
            <option>RUR</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </Field>
        <Field label="Зарплата от">
          <input
            type="number"
            {...register('salaryMin', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
          />
        </Field>
        <Field label="Зарплата до">
          <input
            type="number"
            {...register('salaryMax', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
          />
        </Field>
        <Field label="Формат работы">
          <select {...register('workFormat')}>
            <option value="REMOTE">Удалённо</option>
            <option value="HYBRID">Гибрид</option>
            <option value="ON_SITE">В офисе</option>
            <option value="ANY">Любой</option>
          </select>
        </Field>
        <Field label="Опыт">
          <select {...register('experience')}>
            <option value="">Любой</option>
            <option value="noExperience">Без опыта</option>
            <option value="between1And3">1–3 года</option>
            <option value="between3And6">3–6 лет</option>
            <option value="moreThan6">Более 6 лет</option>
          </select>
        </Field>
        <Field label="Занятость">
          <select {...register('employment')}>
            <option value="full">Полная</option>
            <option value="part">Частичная</option>
            <option value="project">Проектная</option>
          </select>
        </Field>
        <Field label="График (ID справочника hh.ru)">
          <input {...register('schedule')} placeholder="Оставьте пустым для любого" />
        </Field>
        <Field label="Минимальный AI-рейтинг, %">
          <input
            type="number"
            min="0"
            max="100"
            {...register('minScore', { valueAsNumber: true })}
          />
        </Field>
        <Field label="Лимит откликов в день">
          <input
            type="number"
            min="1"
            max="200"
            {...register('dailyLimit', { valueAsNumber: true })}
          />
        </Field>
        <Field label="Интервал проверки, минуты">
          <input type="number" min="15" {...register('intervalMinutes', { valueAsNumber: true })} />
        </Field>
        <Field label="Режим">
          <select {...register('mode')}>
            <option value="APPROVAL">С подтверждением</option>
            <option value="AUTO">Авто, ручное завершение на hh.ru</option>
          </select>
        </Field>
        <Field label="Необязательное письмо">
          <select {...register('letterPolicy')}>
            <option value="AI">По решению AI</option>
            <option value="ALWAYS">Всегда</option>
            <option value="NEVER">Не добавлять</option>
          </select>
        </Field>
      </div>
      <fieldset>
        <legend>Резюме для автоматического выбора</legend>
        {resumes.data?.map((r) => (
          <label className="inline-label" key={r.id}>
            <input type="checkbox" value={r.id} {...register('resumeIds')} />
            {r.title}
          </label>
        ))}
        {!resumes.data?.length && (
          <p className="form-error">Сначала добавьте резюме в разделе «Мои резюме».</p>
        )}
      </fieldset>
      <div className="form-grid">
        {[
          ['exclude', 'Исключающие слова'],
          ['blacklist', 'Чёрный список работодателей'],
          ['whitelist', 'Приоритетные работодатели'],
        ].map(([key, label]) => (
          <Field key={key} label={label} hint="По одному на строку; ID или название компании">
            <textarea
              defaultValue={((initial?.[key] as string[]) ?? []).join('\n')}
              onChange={(e) => setValue(key as 'exclude', split(e.target.value))}
            />
          </Field>
        ))}
      </div>
      <fieldset>
        <legend>Весовые коэффициенты, сумма 100%</legend>
        <div className="form-grid three">
          {Object.entries({
            stack: 'Технологии',
            experience: 'Опыт',
            salary: 'Зарплата',
            format: 'Формат',
            duties: 'Обязанности',
            preferences: 'Предпочтения',
          }).map(([key, label]) => (
            <Field label={label} key={key}>
              <input
                type="number"
                min="0"
                max="100"
                {...register(`weights.${key}` as 'weights.stack', { valueAsNumber: true })}
              />
            </Field>
          ))}
        </div>
      </fieldset>
      <p className="muted">
        Если API не подтверждает формат работы или валюту, вакансия не допускается автоматически.
        Отправка на hh.ru требует пользователя.
      </p>
      <ErrorText
        error={
          error ||
          Object.values(errors)
            .map((v) => v?.message)
            .filter(Boolean)
            .join('; ')
        }
      />
      <Button disabled={isSubmitting}>
        <Save size={16} />
        Сохранить профиль
      </Button>
    </form>
  );
}
export function ResumeForm({ initial, onDone }: { initial?: Resume; onDone: () => void }) {
  const qc = useQueryClient(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          await api('resumes' + (initial ? '/' + initial.id : ''), initial ? 'PATCH' : 'POST', {
            title: f.get('title'),
            content: f.get('content'),
            externalId: String(f.get('externalId') ?? '') || null,
            skills: split(String(f.get('skills'))),
            salary: f.get('salary') ? Number(f.get('salary')) : null,
            currency: f.get('currency'),
            employment: f.get('employment'),
            workFormat: f.get('workFormat'),
            geography: f.get('geography'),
          });
          await qc.invalidateQueries();
          toast.success('Резюме сохранено');
          onDone();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <Field label="Название / желаемая должность">
          <input name="title" defaultValue={initial?.title} required />
        </Field>
        <Field label="ID резюме на hh.ru (если есть)">
          <input name="externalId" defaultValue={initial?.externalId ?? ''} />
        </Field>
      </div>
      <Field
        label="Полный текст резюме"
        hint="Опыт, образование, достижения, языки. Только достоверные сведения."
      >
        <textarea
          name="content"
          defaultValue={initial?.content}
          minLength={30}
          rows={10}
          required
        />
      </Field>
      <Field label="Ключевые навыки через запятую">
        <input name="skills" defaultValue={initial?.skills.join(', ')} />
      </Field>
      <div className="form-grid">
        <Field label="Ожидаемая зарплата">
          <input type="number" name="salary" defaultValue={initial?.salary ?? ''} />
        </Field>
        <Field label="Валюта">
          <select name="currency" defaultValue={initial?.currency ?? 'RUR'}>
            <option>RUR</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </Field>
        <Field label="Занятость">
          <select name="employment" defaultValue={initial?.employment ?? 'full'}>
            <option value="full">Полная</option>
            <option value="part">Частичная</option>
            <option value="project">Проектная</option>
          </select>
        </Field>
        <Field label="Формат">
          <select name="workFormat" defaultValue={initial?.workFormat ?? 'REMOTE'}>
            <option value="REMOTE">Удалённо</option>
            <option value="HYBRID">Гибрид</option>
            <option value="ON_SITE">В офисе</option>
          </select>
        </Field>
        <Field label="География поиска">
          <input name="geography" defaultValue={initial?.geography} />
        </Field>
      </div>
      <label className="inline-label">
        <input type="checkbox" required />
        Подтверждаю достоверность указанных данных
      </label>
      <ErrorText error={error} />
      <Button disabled={busy}>Сохранить резюме</Button>
    </form>
  );
}
type Candidate = {
  facts: string;
  english: string;
  salary: number | null;
  relocate: boolean;
  travel: boolean;
  preferences: string;
  constraints: string;
  skills: { name: string; years: number; evidence: string }[];
};
export function CandidateForm() {
  const data = useQuery({ queryKey: ['candidate'], queryFn: () => api<Candidate>('candidate') });
  if (!data.data) return null;
  return <CandidateEditor initial={data.data} />;
}
function CandidateEditor({ initial }: { initial: Candidate }) {
  const qc = useQueryClient(),
    [skills, setSkills] = useState(initial.skills),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="panel candidate-panel">
      <div className="panel-title">
        <div>
          <h2>База знаний кандидата</h2>
          <p className="muted">Подтверждённые факты для писем и ответов работодателям.</p>
        </div>
        <ShieldCheck size={23} />
      </div>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api('candidate', 'PUT', {
              facts: f.get('facts'),
              english: f.get('english'),
              salary: f.get('salary') ? Number(f.get('salary')) : null,
              relocate: f.has('relocate'),
              travel: f.has('travel'),
              preferences: f.get('preferences'),
              constraints: f.get('constraints'),
              skills,
            });
            await qc.invalidateQueries();
            toast.success('База знаний обновлена');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Подтверждённые факты и достижения"
          hint="Один короткий факт на строку. Письма используют эти формулировки дословно; подготовьте их на нужном языке."
        >
          <textarea
            name="facts"
            rows={5}
            defaultValue={initial.facts}
            placeholder="Разработал личный кабинет на React и TypeScript для 3 000 пользователей."
          />
        </Field>
        <div className="form-grid">
          <Field label="Уровень английского">
            <input
              name="english"
              defaultValue={initial.english}
              placeholder="B2, использую на работе"
            />
          </Field>
          <Field label="Зарплатные ожидания, ₽">
            <input type="number" name="salary" defaultValue={initial.salary ?? ''} />
          </Field>
          <Field label="Отрасли и предпочтения">
            <textarea name="preferences" defaultValue={initial.preferences} />
          </Field>
          <Field label="Ограничения">
            <textarea name="constraints" defaultValue={initial.constraints} />
          </Field>
        </div>
        <div className="actions">
          <label className="inline-label">
            <input name="relocate" type="checkbox" defaultChecked={initial.relocate} />
            Готовность к переезду
          </label>
          <label className="inline-label">
            <input name="travel" type="checkbox" defaultChecked={initial.travel} />
            Готовность к командировкам
          </label>
        </div>
        <h3>Навыки и реальный опыт</h3>
        {skills.map((s, i) => (
          <div className="skill-row" key={i}>
            <Field label="Навык">
              <input
                required
                value={s.name}
                onChange={(e) =>
                  setSkills(skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
            </Field>
            <Field label="Лет опыта">
              <input
                required
                type="number"
                min="0"
                max="60"
                step="0.5"
                value={s.years}
                onChange={(e) =>
                  setSkills(
                    skills.map((x, j) => (j === i ? { ...x, years: Number(e.target.value) } : x)),
                  )
                }
              />
            </Field>
            <Field label="Подтверждение опыта">
              <input
                required
                value={s.evidence}
                onChange={(e) =>
                  setSkills(
                    skills.map((x, j) => (j === i ? { ...x, evidence: e.target.value } : x)),
                  )
                }
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSkills(skills.filter((_, j) => j !== i))}
            >
              Удалить
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setSkills([...skills, { name: '', years: 0, evidence: '' }])}
        >
          <Plus size={15} />
          Добавить навык
        </Button>
        <ErrorText error={error} />
        <Button disabled={busy}>
          <Save size={16} />
          Сохранить подтверждённые данные
        </Button>
      </form>
    </div>
  );
}
export function SettingsPanel() {
  const [tab, setTab] = useState('connections');
  const data = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('settings') });
  return (
    <>
      <div className="tabs">
        {[
          ['connections', 'Подключения'],
          ['agent', 'Правила агента'],
          ['ai', 'Настройки AI'],
          ['notifications', 'Уведомления'],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'connections' && (
        <div className="panel connection-panel">
          <div className="panel-title">
            <div>
              <h2>HeadHunter</h2>
              <p className="muted">Официальный OAuth 2.0 с PKCE</p>
            </div>
            <span className="hh-logo">hh</span>
          </div>
          <p>
            JobHunter AI не получает и не хранит ваш пароль от hh.ru. Токены шифруются на сервере.
          </p>
          <div className="actions">
            <Link prefetch={false} className="btn btn-primary" href="/api/auth/hh">
              Подключить hh.ru
              <ExternalLink size={16} />
            </Link>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await api('hh/disconnect', 'POST', {});
                  location.reload();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Отключить
            </Button>
          </div>
          <h3>Доступные операции</h3>
          <ul className="capabilities">
            <li>
              <CheckCircle2 size={17} />
              Поиск и описание вакансий
            </li>
            <li>
              <CheckCircle2 size={17} />
              Информация об аккаунте
            </li>
            <li>
              <ShieldCheck size={17} />
              Чаты — если hh.ru предоставляет доступ аккаунту
            </li>
          </ul>
          <div className="notice warning">
            <p>
              В текущей public OpenAPI отсутствуют отправка отклика соискателем и список собственных
              резюме. Отправляйте отклики на hh.ru и добавляйте резюме вручную. Права определяет
              hh.ru; приложение не выдумывает OAuth scopes.
            </p>
          </div>
          <p className="muted">
            Отключение удаляет локальные токены и останавливает агента. Для полного отзыва доступа
            удалите приложение также в настройках hh.ru.
          </p>
        </div>
      )}
      {tab === 'ai' && <AISettings />}
      {data.data && (tab === 'agent' || tab === 'notifications') && (
        <SettingsForm key={tab} initial={data.data} notifications={tab === 'notifications'} />
      )}
    </>
  );
}
function SettingsForm({ initial, notifications }: { initial: Settings; notifications: boolean }) {
  const qc = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>{notifications ? 'Email-уведомления' : 'Правила и ограничения'}</h2>
        <ShieldCheck size={20} />
      </div>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const next = { ...initial };
          for (const [k, v] of f.entries()) {
            const key = k as keyof Settings;
            if (typeof initial[key] === 'number')
              (next as unknown as Record<string, unknown>)[k] = Number(v);
            else (next as unknown as Record<string, unknown>)[k] = String(v);
          }
          if (notifications) {
            next.smtpTls = f.has('smtpTls');
            next.notificationTypes = f.getAll('notificationTypes').map(String);
          } else {
            next.dryRun = f.has('dryRun');
            next.blacklist = split(String(f.get('blacklist') ?? ''));
            next.blockedVacancies = split(String(f.get('blockedVacancies') ?? ''));
          }
          try {
            await api('settings', 'PUT', next);
            await qc.invalidateQueries();
            toast.success('Настройки сохранены');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {notifications ? (
          <>
            <div className="form-grid">
              <Field label="SMTP host">
                <input
                  name="smtpHost"
                  defaultValue={initial.smtpHost}
                  placeholder="smtp.example.com"
                />
              </Field>
              <Field label="Порт">
                <input name="smtpPort" type="number" defaultValue={initial.smtpPort} />
              </Field>
              <Field label="Имя пользователя">
                <input name="smtpUser" defaultValue={initial.smtpUser} autoComplete="off" />
              </Field>
              <Field
                label="Пароль приложения"
                hint={
                  initial.hasSmtpSecret
                    ? 'Пароль сохранён. При смене подключения введите его заново.'
                    : undefined
                }
              >
                <input name="smtpSecret" type="password" autoComplete="new-password" />
              </Field>
              <Field label="Email отправителя">
                <input name="smtpFrom" type="email" defaultValue={initial.smtpFrom} />
              </Field>
            </div>
            <label className="inline-label">
              <input type="checkbox" name="smtpTls" defaultChecked={initial.smtpTls} />
              Требовать TLS
            </label>
            <fieldset>
              <legend>Типы уведомлений</legend>
              {Object.entries({
                TASK: 'Задачи и тестовые',
                INVITATION: 'Приглашения',
                MESSAGE: 'Сообщения',
                AUTH: 'Авторизация',
                PAUSE: 'Остановка агента',
                LIMIT: 'Лимиты',
                DIGEST: 'Ежедневный дайджест после 20:00',
              }).map(([key, label]) => (
                <label className="inline-label" key={key}>
                  <input
                    type="checkbox"
                    name="notificationTypes"
                    value={key}
                    defaultChecked={initial.notificationTypes.includes(key)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="muted">
              Адрес получателя — почта вашего аккаунта. SMTP host должен быть добавлен владельцем
              сервера в SMTP_ALLOWED_HOSTS.
            </p>
          </>
        ) : (
          <>
            <label className="inline-label">
              <input type="checkbox" name="dryRun" defaultChecked={initial.dryRun} />
              Dry Run — анализировать и готовить без отправки
            </label>
            <div className="form-grid">
              <Field label="Общий лимит откликов за 24 часа">
                <input type="number" name="dailyLimit" defaultValue={initial.dailyLimit} />
              </Field>
              <Field label="Лимит на работодателя за 24 часа">
                <input type="number" name="employerLimit" defaultValue={initial.employerLimit} />
              </Field>
              <Field label="Начало активности, час">
                <input
                  name="activeStart"
                  type="number"
                  min="0"
                  max="23"
                  defaultValue={initial.activeStart}
                />
              </Field>
              <Field label="Окончание активности, час">
                <input
                  name="activeEnd"
                  type="number"
                  min="1"
                  max="24"
                  defaultValue={initial.activeEnd}
                />
              </Field>
              <Field label="Часовой пояс">
                <input name="timezone" defaultValue={initial.timezone} />
              </Field>
            </div>
            <Field label="Инструкции для сопроводительных писем">
              <textarea name="letterInstructions" defaultValue={initial.letterInstructions} />
            </Field>
            <Field
              label="Чёрный список компаний"
              hint="ID или точное название, по одному на строку"
            >
              <textarea name="blacklist" defaultValue={initial.blacklist.join('\n')} />
            </Field>
            <Field label="Исключённые вакансии" hint="ID вакансий, по одному на строку">
              <textarea
                name="blockedVacancies"
                defaultValue={initial.blockedVacancies.join('\n')}
              />
            </Field>
            <p className="muted">
              Лимиты применяются к сохранённым подтверждениям отправки. Ручные действия вне
              приложения контролируются hh.ru.
            </p>
          </>
        )}
        <ErrorText error={error} />
        <Button disabled={busy}>
          <Save size={15} />
          Сохранить настройки
        </Button>
      </form>
    </div>
  );
}
type Provider = {
  purpose: string;
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  language: string;
  instructions: string;
  dailyBudget: number;
  inputPrice: number;
  outputPrice: number;
  hasKey: boolean;
};
function AISettings() {
  const [purpose, setPurpose] = useState('ANALYSIS');
  const data = useQuery({ queryKey: ['providers'], queryFn: () => api<Provider[]>('providers') });
  return (
    <>
      <div className="notice">
        <Sparkles size={19} />
        <p>
          Настройте модель для каждого назначения. Для Ollama используйте совместимый адрес
          http://ollama:11434/v1. Адрес должен быть разрешён в AI_ALLOWED_HOSTS.
        </p>
      </div>
      <div className="tabs">
        {[
          ['ANALYSIS', 'Анализ вакансий'],
          ['LETTER', 'Письма'],
          ['CLASSIFICATION', 'Сообщения'],
          ['SCREENING', 'Вопросы'],
        ].map(([k, v]) => (
          <button key={k} className={k === purpose ? 'active' : ''} onClick={() => setPurpose(k)}>
            {v}
          </button>
        ))}
      </div>
      {!data.isPending && (
        <AIForm
          key={purpose}
          purpose={purpose}
          initial={data.data?.find((p) => p.purpose === purpose)}
        />
      )}
    </>
  );
}
function AIForm({ purpose, initial }: { purpose: string; initial?: Provider }) {
  const qc = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="panel">
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const values: Record<string, unknown> = Object.fromEntries(f);
          for (const key of [
            'temperature',
            'maxTokens',
            'dailyBudget',
            'inputPrice',
            'outputPrice',
          ])
            values[key] = Number(values[key]);
          try {
            await api('providers', 'PUT', { ...values, purpose });
            await qc.invalidateQueries();
            toast.success('Настройки AI сохранены');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Провайдер">
            <select name="provider" defaultValue={initial?.provider ?? 'OPENAI'}>
              <option value="OPENAI">OpenAI-совместимый API</option>
              <option value="OLLAMA">Ollama</option>
            </select>
          </Field>
          <Field label="Base URL">
            <input
              name="baseUrl"
              type="url"
              defaultValue={initial?.baseUrl ?? 'https://api.openai.com/v1'}
              required
            />
          </Field>
          <Field
            label="API key"
            hint={
              initial?.hasKey
                ? 'Ключ сохранён. При смене провайдера или адреса введите его заново.'
                : undefined
            }
          >
            <input name="apiKey" type="password" autoComplete="new-password" />
          </Field>
          <Field label="Модель">
            <input
              name="model"
              defaultValue={initial?.model ?? ''}
              placeholder="Название модели у провайдера"
              required
            />
          </Field>
          <Field label="Temperature">
            <input
              type="number"
              name="temperature"
              step="0.1"
              min="0"
              max="1"
              defaultValue={initial?.temperature ?? 0.2}
            />
          </Field>
          <Field label="Максимум токенов">
            <input type="number" name="maxTokens" defaultValue={initial?.maxTokens ?? 1800} />
          </Field>
          <Field label="Дневной бюджет, USD">
            <input
              type="number"
              step="0.01"
              name="dailyBudget"
              defaultValue={initial?.dailyBudget ?? 1}
            />
          </Field>
          <Field label="Язык">
            <select name="language" defaultValue={initial?.language ?? 'ru'}>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Цена за 1 млн входящих токенов, USD">
            <input
              type="number"
              step="0.001"
              name="inputPrice"
              defaultValue={initial?.inputPrice ?? 0}
            />
          </Field>
          <Field label="Цена за 1 млн исходящих токенов, USD">
            <input
              type="number"
              step="0.001"
              name="outputPrice"
              defaultValue={initial?.outputPrice ?? 0}
            />
          </Field>
        </div>
        <Field label="Системные инструкции">
          <textarea name="instructions" rows={4} defaultValue={initial?.instructions} />
        </Field>
        <ErrorText error={error} />
        <div className="actions">
          <Button disabled={busy}>
            <Save size={15} />
            Сохранить
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !initial}
            onClick={async () => {
              setBusy(true);
              try {
                await api('providers/test', 'POST', { purpose });
                toast.success('Модель отвечает, JSON прошёл проверку');
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Проверить подключение
          </Button>
        </div>
      </form>
    </div>
  );
}
