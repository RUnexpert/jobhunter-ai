'use client';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Send,
  SlidersHorizontal,
  FileUser,
  Inbox,
  ChartNoAxesCombined,
  History,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  Play,
  Pause,
  Square,
  RefreshCw,
  ChevronRight,
  Check,
  Sun,
  Moon,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  Target,
  Eye,
  Handshake,
  ExternalLink,
  X,
  Download,
  CheckCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Button } from './ui/button';
import type { Application, Dashboard, Task, Resume, Search as SearchProfile } from './types';
import { SearchForm, ResumeForm, CandidateForm, SettingsPanel } from './forms';
export async function api<T = unknown>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const r = await fetch('/api/' + path, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error ?? 'Не удалось загрузить данные');
  return out;
}
export const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Ещё не было';
export const salary = (v: Application['vacancy']) =>
  v.salaryFrom || v.salaryTo
    ? `${v.salaryFrom ? 'от ' + v.salaryFrom.toLocaleString('ru-RU') : ''}${v.salaryTo ? ' до ' + v.salaryTo.toLocaleString('ru-RU') : ''} ${v.currency === 'RUR' ? '₽' : (v.currency ?? '')}`
    : 'Зарплата не указана';
const nav = [
  ['dashboard', 'Обзор', LayoutDashboard],
  ['vacancies', 'Вакансии', BriefcaseBusiness],
  ['applications', 'Отклики', Send],
  ['profiles', 'Поисковые профили', SlidersHorizontal],
  ['resumes', 'Мои резюме', FileUser],
  ['attention', 'Требуют внимания', Inbox],
  ['analytics', 'Аналитика', ChartNoAxesCombined],
  ['activity', 'История активности', History],
  ['settings', 'Настройки', Settings],
] as const;
const statuses: Record<string, string> = {
  DISCOVERED: 'Найдена',
  ANALYZING: 'Анализируется',
  READY_TO_APPLY: 'Готова к отклику',
  AWAITING_APPROVAL: 'Ждёт подтверждения',
  APPLYING: 'Отправляется',
  APPLIED: 'Отклик отправлен',
  FAILED: 'Ошибка',
  SKIPPED: 'Пропущена',
  REQUIRES_USER_ACTION: 'Требует внимания',
};
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Search size={25} />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const selectors =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])';
    modalRef.current?.querySelector<HTMLElement>(selectors)?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const elements = modalRef.current?.querySelectorAll<HTMLElement>(selectors);
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', f);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', f);
      document.body.style.overflow = original;
      before?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <Button variant="ghost" aria-label="Закрыть" onClick={onClose}>
            <X size={19} />
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Auth({ onDone }: { onDone: () => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-screen">
      <div className="auth-art">
        <div className="brand-mark">
          <Target size={30} />
        </div>
        <h1>
          Следующий шаг
          <br />в вашей карьере.
        </h1>
        <p>
          Вакансии, которые подходят вам.
          <br />
          Решения, которые остаются за вами.
        </p>
        <div className="auth-facts">
          <span>
            <ShieldCheck size={18} /> Официальный OAuth hh.ru
          </span>
          <span>
            <CheckCheck size={18} /> Только подтверждённые факты
          </span>
          <span>
            <Pause size={18} /> Полный контроль над агентом
          </span>
        </div>
      </div>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api('auth/' + (register ? 'register' : 'login'), 'POST', Object.fromEntries(f));
            onDone();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand">
          <Target /> JobHunter <b>AI</b>
        </div>
        <h2>{register ? 'Создайте рабочее пространство' : 'С возвращением'}</h2>
        <p className="muted">
          {register
            ? 'Для регистрации нужен код из настроек сервера.'
            : 'Войдите, чтобы продолжить поиск работы.'}
        </p>
        <label>
          Электронная почта
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </label>
        <label>
          Пароль
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete={register ? 'new-password' : 'current-password'}
            required
            placeholder="Не менее 12 символов"
          />
        </label>
        {register && (
          <label>
            Код регистрации
            <input name="inviteCode" required type="password" autoComplete="off" />
          </label>
        )}
        <Button disabled={busy}>
          {busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}
          <ArrowUpRight size={17} />
        </Button>
        <button type="button" className="text-link" onClick={() => setRegister(!register)}>
          {register ? 'Уже есть аккаунт? Войти' : 'Первый запуск? Создать аккаунт'}
        </button>
      </form>
    </main>
  );
}
export default function Workspace({ section }: { section: string }) {
  const qc = useQueryClient(),
    me = useQuery({ queryKey: ['me'], queryFn: () => api<{ email: string }>('me'), retry: false });
  const data = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('dashboard'),
    enabled: !!me.data,
    refetchInterval: 30000,
  });
  const [dark, setDark] = useState(false),
    [mobile, setMobile] = useState(false),
    [confirm, setConfirm] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = localStorage.getItem('jh-theme') === 'dark';
    queueMicrotask(() => setDark(d));
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
  }, []);
  useEffect(() => {
    if (!me.data) return;
    const s = new EventSource('/api/events');
    s.onmessage = () => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    };
    return () => s.close();
  }, [me.data, qc]);
  async function agent(action: string) {
    setBusy(true);
    try {
      await api('agent', 'POST', { action });
      await qc.invalidateQueries();
      toast.success(
        action === 'START'
          ? 'Агент запущен'
          : action === 'SCAN'
            ? 'Проверка добавлена в очередь'
            : 'Агент остановлен',
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  if (me.isPending)
    return (
      <div className="skeleton-screen">
        <div className="skeleton" />
      </div>
    );
  if (!me.data)
    return (
      <Auth
        onDone={() => {
          void qc.invalidateQueries();
        }}
      />
    );
  const d = data.data,
    active = d?.agentState === 'RUNNING';
  const title = nav.find((n) => n[0] === section)?.[1];
  return (
    <div className="workspace">
      <aside className={mobile ? 'sidebar mobile-open' : 'sidebar'}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Target size={23} />
          </span>
          JobHunter <b>AI</b>
        </Link>
        <div className="workspace-label">Рабочее пространство</div>
        <nav>
          {nav.map(([key, label, Icon], i) => (
            <Link
              key={key}
              onClick={() => setMobile(false)}
              href={key === 'dashboard' ? '/' : '/' + key}
              className={`${section === key ? 'selected' : ''} ${i === 8 ? 'nav-settings' : ''}`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {key === 'attention' && !!d?.kpi.attention && <small>{d.kpi.attention}</small>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-agent">
          <span className={'status-dot ' + (active ? 'green' : '')} />
          <strong>{active ? 'Агент работает' : 'Агент остановлен'}</strong>
          <p>{d?.dryRun ? 'Безопасный режим Dry Run' : 'Ручное завершение на hh.ru'}</p>
          <div className="agent-line">
            <span style={{ width: active ? '60%' : '0%' }} />
          </div>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{me.data.email.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>Мой аккаунт</strong>
            <small>{me.data.email}</small>
          </div>
          <button
            aria-label="Выйти"
            onClick={async () => {
              await api('auth/logout', 'POST', {});
              qc.clear();
              location.reload();
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="Открыть меню"
            >
              <Menu />
            </button>
            <span className="muted">Рабочее пространство</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            {active && (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                aria-label="Немедленно остановить агента"
                onClick={() => void agent('STOP')}
              >
                <Square size={12} />
                Стоп
              </Button>
            )}
            <span className="connection">
              <span className={'status-dot ' + (d?.account?.connected ? 'green' : '')} />
              hh.ru {d?.account?.connected ? 'подключён' : 'не подключён'}
            </span>
            <button
              aria-label="Переключить тему"
              onClick={() => {
                setDark(!dark);
                document.documentElement.dataset.theme = !dark ? 'dark' : 'light';
                localStorage.setItem('jh-theme', !dark ? 'dark' : 'light');
              }}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link href="/attention" aria-label="Уведомления">
              <Inbox size={19} />
            </Link>
            <div className="avatar small">{me.data.email.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyeline">Ваш поиск под контролем</div>
              <h1>{section === 'dashboard' ? 'Обзор поиска' : title}</h1>
              <p className="muted">
                {section === 'dashboard'
                  ? 'Всё, что происходит на пути к новой работе.'
                  : section === 'vacancies'
                    ? 'Найденные вакансии, объяснения AI и следующие действия.'
                    : section === 'applications'
                      ? 'От первого отклика до предложения о работе.'
                      : section === 'profiles'
                        ? 'Независимые стратегии поиска с вашими правилами.'
                        : section === 'resumes'
                          ? 'Ваш реальный опыт — основа решений агента.'
                          : section === 'attention'
                            ? 'Здесь агент передаёт решение вам.'
                            : section === 'analytics'
                              ? 'Результаты поиска на основе сохранённой истории.'
                              : section === 'settings'
                                ? 'Подключения, AI и правила автоматизации.'
                                : 'Прозрачная история решений и действий.'}
              </p>
            </div>
            {section === 'dashboard' && (
              <div className="actions">
                <Button variant="outline" disabled={busy} onClick={() => void agent('SCAN')}>
                  <RefreshCw size={16} />
                  Проверить сейчас
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => (active ? setConfirm('STOP') : void agent('START'))}
                >
                  {active ? <Square size={15} /> : <Play size={15} />}{' '}
                  {active ? 'Остановить агента' : 'Запустить агента'}
                </Button>
              </div>
            )}
          </div>
          {data.isError && (
            <div className="notice error">
              <TriangleAlert size={18} />
              Не удалось загрузить данные. Проверьте PostgreSQL и обновите страницу.
            </div>
          )}
          {section === 'dashboard' && d && <Overview d={d} onAgent={agent} />}
          {section === 'vacancies' && <Vacancies />}
          {section === 'applications' && <Applications />}
          {section === 'profiles' && <Profiles />}
          {section === 'resumes' && <Resumes />}
          {section === 'attention' && <Attention />}
          {section === 'analytics' && d && <Analytics d={d} />}
          {section === 'activity' && <Activity />}
          {section === 'settings' && <SettingsPanel />}
          {data.isPending && <div className="skeleton tall" />}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} />
              Ваши данные защищены. Действия записываются в журнал.
            </span>
            <span>JobHunter AI / рабочее пространство</span>
          </footer>
        </main>
      </div>
      {confirm && (
        <Modal title="Остановить агента?" onClose={() => setConfirm(null)}>
          <p>
            Новые действия прекратятся сразу. Уже начатые запросы к сервисам могут завершиться.
            Сохранённые результаты останутся в истории.
          </p>
          <div className="actions">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Отмена
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void agent(confirm)}>
              Остановить
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Overview({ d, onAgent }: { d: Dashboard; onAgent: (action: string) => Promise<void> }) {
  const metrics = [
    ['found', 'Найдено вакансий', BriefcaseBusiness],
    ['analyzed', 'Проанализировано', Sparkles],
    ['matched', 'Подходят вам', Target],
    ['applied', 'Откликов отправлено', Send],
    ['viewed', 'Просмотрено', Eye],
    ['invited', 'Приглашений', Handshake],
    ['rejected', 'Отказов', X],
    ['attention', 'Требуют внимания', Inbox],
  ] as const;
  return (
    <>
      <div className="agent-strip">
        <div className="agent-emblem">
          <Sparkles size={24} />
        </div>
        <div>
          <strong>
            {d.agentState === 'RUNNING'
              ? 'Агент ищет вашу следующую работу'
              : 'Готовы к следующему шагу?'}
          </strong>
          <p>
            {d.account?.connected
              ? 'Аккаунт hh.ru подключён. Настройте профиль и запустите поиск.'
              : 'Подключите hh.ru, добавьте резюме и настройте первый поисковый профиль.'}
          </p>
        </div>
        <Link className="text-link" href="/settings">
          Настроить подключение
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="agent-meta">
        <span>
          <span className={'status-dot ' + (d.agentState === 'RUNNING' ? 'green' : '')} />
          {d.agentState === 'RUNNING'
            ? 'Агент активен'
            : d.agentState === 'PAUSED'
              ? 'На паузе'
              : 'Не запущен'}
        </span>
        <span>
          Последняя проверка: <b>{date(d.lastScanAt)}</b>
        </span>
        <span>
          Активных профилей: <b>{d.profiles}</b>
        </span>
        <span className="badge">{d.dryRun ? 'Dry Run включён' : 'Ручная отправка на hh.ru'}</span>
        {d.agentState === 'RUNNING' && (
          <button className="text-link" onClick={() => void onAgent('PAUSE')}>
            <Pause size={13} />
            На паузу
          </button>
        )}
      </div>
      <div className="metric-grid">
        {metrics.map(([key, label, Icon]) => (
          <div
            className={
              'metric ' +
              (key === 'invited' ? 'metric-green' : key === 'attention' ? 'metric-attention' : '')
            }
            key={key}
          >
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{d.kpi[key]?.toLocaleString('ru-RU') ?? 0}</strong>
            <small>
              {key === 'applied'
                ? 'Подтверждено пользователем'
                : key === 'attention'
                  ? 'Ждут вашего решения'
                  : 'За всё время'}
            </small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <Chart applications={d.applications} />
        <Funnel d={d} />
      </div>
      <div className="dashboard-grid bottom-grid">
        <div className="panel">
          <div className="panel-title">
            <h2>Последние вакансии</h2>
            <Link href="/vacancies">
              Все вакансии
              <ChevronRight size={14} />
            </Link>
          </div>
          {d.applications.length ? (
            <div className="compact-list">
              {d.applications.slice(0, 4).map((a) => (
                <Link href="/vacancies" key={a.id}>
                  <div className="company-avatar">{a.vacancy.employer[0]}</div>
                  <div>
                    <strong>{a.vacancy.title}</strong>
                    <small>{a.vacancy.employer}</small>
                  </div>
                  <span className="score">
                    {a.analysis?.score ?? '—'}
                    {a.analysis ? '%' : ''}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="Ваша следующая работа — впереди">
              <p>После первой проверки здесь появятся реальные вакансии.</p>
              <Link className="text-link" href="/profiles">
                Создать поисковый профиль
                <Plus size={14} />
              </Link>
            </Empty>
          )}
        </div>
        <div className="panel setup-panel">
          <div className="panel-title">
            <h2>Начните с вашего профиля</h2>
            <span className="badge">Настройка</span>
          </div>
          {[
            [
              'Подключите аккаунт hh.ru',
              'Официальная авторизация без пароля',
              'settings',
              !!d.account?.connected,
            ],
            [
              'Добавьте резюме и факты',
              'Только ваш подтверждённый опыт',
              'resumes',
              d.profiles > 0,
            ],
            [
              'Создайте поисковый профиль',
              'Задайте критерии и правила поиска',
              'profiles',
              d.profiles > 0,
            ],
          ].map(([title, desc, path, done], i) => (
            <Link key={String(path)} href={'/' + path} className="setup-step">
              <span className={done ? 'step done' : 'step'}>
                {done ? <Check size={15} /> : i + 1}
              </span>
              <div>
                <strong>{title}</strong>
                <small>{desc}</small>
              </div>
              <ChevronRight size={16} />
            </Link>
          ))}
        </div>
      </div>
      <div className="notice">
        <ShieldCheck size={18} />
        <div>
          <strong>Автоматизация с вашим участием</strong>
          <p>
            AI анализирует вакансии и готовит материалы. Отправка отклика завершается на hh.ru:
            текущая public OpenAPI не описывает эту операцию для соискателя.
          </p>
        </div>
      </div>
    </>
  );
}
function Chart({ applications }: { applications: Application[] }) {
  const [days, setDays] = useState(7);
  const points = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - days + 1 + i);
    const key = d.toLocaleDateString('en-CA');
    return {
      name: d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }),
      value: applications.filter(
        (a) => a.appliedAt && new Date(a.appliedAt).toLocaleDateString('en-CA') === key,
      ).length,
    };
  });
  return (
    <div className="panel chart-panel">
      <div className="panel-title">
        <div>
          <h2>Динамика откликов</h2>
          <p className="muted">Подтверждённые отклики по дням</p>
        </div>
        <div className="segmented">
          {[7, 30, 90].map((n) => (
            <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>
              {n} дн.
            </button>
          ))}
        </div>
      </div>
      <div className="chart-area">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={points} margin={{ top: 15, right: 10, bottom: 0, left: -30 }}>
            <defs>
              <linearGradient id="blue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4266f5" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#4266f5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              minTickGap={40}
              tick={{ fontSize: 11, fill: '#8994a8' }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#8994a8' }}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                fontSize: 12,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
              formatter={(v) => [v, 'Отклики']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#4266f5"
              strokeWidth={2.5}
              fill="url(#blue)"
            />
          </AreaChart>
        </ResponsiveContainer>
        {!applications.some((a) => a.appliedAt) && (
          <div className="chart-caption">
            Пока нет отправленных откликов. График заполнится по мере поиска.
          </div>
        )}
      </div>
    </div>
  );
}
function Funnel({ d }: { d: Dashboard }) {
  const steps = [
    ['Найдено', d.kpi.found],
    ['Подошло', d.kpi.matched],
    ['Отклик', d.kpi.applied],
    ['Просмотр', d.kpi.viewed],
    ['Приглашение', d.kpi.invited],
    [
      'Собеседование',
      d.applications.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.pipeline)).length,
    ],
    ['Оффер', d.applications.filter((a) => a.pipeline === 'OFFER').length],
  ] as const;
  return (
    <div className="panel funnel">
      <div className="panel-title">
        <h2>Воронка поиска</h2>
        <ChartNoAxesCombined size={18} />
      </div>
      {steps.map(([name, num], i) => (
        <div className="funnel-row" key={name}>
          <span>{name}</span>
          <div>
            <span
              style={{
                width: `${d.kpi.found ? Math.max(3, (num / d.kpi.found) * 100) : 0}%`,
                opacity: 1 - i * 0.09,
              }}
            />
          </div>
          <strong>{num}</strong>
        </div>
      ))}
      <small className="muted">Этапы после отклика отмечаются пользователем</small>
    </div>
  );
}
function Vacancies() {
  const [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [score, setScore] = useState('0'),
    [profile, setProfile] = useState(''),
    [salaryMin, setSalaryMin] = useState(''),
    [since, setSince] = useState(''),
    [selected, setSelected] = useState<Application | null>(null);
  const profiles = useQuery({
    queryKey: ['search-profiles'],
    queryFn: () => api<SearchProfile[]>('search-profiles'),
  });
  const data = useQuery({
    queryKey: ['vacancies', q, status, score, profile, salaryMin, since],
    queryFn: () =>
      api<Application[]>(
        'vacancies?' + new URLSearchParams({ q, status, score, profile, salary: salaryMin, since }),
      ),
  });
  return (
    <>
      <div className="filters">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Найти вакансию"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Должность или компания"
          />
        </div>
        <select aria-label="Статус" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(statuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Минимальный рейтинг"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        >
          <option value="0">Любой AI-рейтинг</option>
          <option value="70">От 70%</option>
          <option value="85">От 85%</option>
        </select>
        <select
          aria-label="Поисковый профиль"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
        >
          <option value="">Все профили</option>
          {profiles.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="filter-input"
          type="number"
          min="0"
          aria-label="Зарплата от"
          placeholder="Зарплата от"
          value={salaryMin}
          onChange={(e) => setSalaryMin(e.target.value)}
        />
        <input
          className="filter-input"
          type="date"
          aria-label="Опубликовано после"
          value={since}
          onChange={(e) => setSince(e.target.value)}
        />
        <a download href="/api/export" className="btn btn-outline">
          <Download size={15} />
          CSV
        </a>
      </div>
      <div className="panel table-panel">
        <div className="panel-title">
          <h2>
            Вакансии <span className="count">{data.data?.length ?? 0}</span>
          </h2>
          <span className="muted">До 500 результатов</span>
        </div>
        {data.isPending ? (
          <div className="skeleton tall" />
        ) : data.isError ? (
          <Empty title="Не удалось загрузить вакансии" />
        ) : !data.data?.length ? (
          <Empty title="Подходящих вакансий пока нет">
            <p>Создайте профиль, подключите hh.ru и запустите агента.</p>
            <Link href="/profiles" className="text-link">
              Настроить поиск
            </Link>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Вакансия / компания</th>
                  <th>Зарплата</th>
                  <th>AI Match</th>
                  <th>Резюме</th>
                  <th>Опубликована</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id} onClick={() => setSelected(a)}>
                    <td>
                      <button className="cell-title">{a.vacancy.title}</button>
                      <small>{a.vacancy.employer}</small>
                    </td>
                    <td>{salary(a.vacancy)}</td>
                    <td>
                      <span className={'score ' + ((a.analysis?.score ?? 0) > 80 ? 'high' : '')}>
                        {a.analysis?.score ?? '—'}
                        {a.analysis ? '%' : ''}
                      </span>
                    </td>
                    <td>{a.resume?.title ?? 'Не выбрано'}</td>
                    <td>{date(a.vacancy.publishedAt)}</td>
                    <td>
                      <span className={'badge status-' + a.status}>{statuses[a.status]}</span>
                    </td>
                    <td>
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selected && <VacancyModal a={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
function VacancyModal({ a, onClose }: { a: Application; onClose: () => void }) {
  const qc = useQueryClient(),
    [letter, setLetter] = useState(a.letter?.text ?? ''),
    [confirm, setConfirm] = useState(false),
    [question, setQuestion] = useState(''),
    [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(false);
  async function action(name: string, data: unknown = {}) {
    setBusy(true);
    try {
      const result = await api<{ letter?: { text: string } | null }>(
        `applications/${a.id}/${name}`,
        'POST',
        data,
      );
      if (name === 'letter' && result.letter) setLetter(result.letter.text);
      await qc.invalidateQueries();
      toast.success('Сохранено');
      if (name !== 'letter') onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={a.vacancy.title} onClose={onClose}>
      <div className="detail-head">
        <div>
          <strong>{a.vacancy.employer}</strong>
          <p>{salary(a.vacancy)}</p>
        </div>
        <span className="score large">
          {a.analysis?.score ?? '—'}
          {a.analysis ? '%' : ''}
        </span>
      </div>
      <div className="notice">
        <ShieldCheck size={18} />
        <p>{a.error ?? 'Отправка отклика завершается вручную на hh.ru.'}</p>
      </div>
      <div className="actions">
        <a
          className="btn btn-primary"
          target="_blank"
          rel="noopener noreferrer"
          href={a.vacancy.url}
        >
          Откликнуться на hh.ru
          <ExternalLink size={15} />
        </a>
        <Button variant="outline" onClick={() => setConfirm(!confirm)}>
          Я отправил отклик
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void action('skip')}>
          Пропустить
        </Button>
      </div>
      {confirm && (
        <div className="notice warning">
          <div>
            <strong>Отклик действительно отправлен на hh.ru?</strong>
            <p>Это ручная отметка. Приложение не может подтвердить отправку через текущий API.</p>
            <Button disabled={busy} onClick={() => void action('confirm', { confirmed: true })}>
              Подтверждаю отправку
            </Button>
          </div>
        </div>
      )}
      {a.status === 'FAILED' && (
        <Button variant="outline" disabled={busy} onClick={() => void action('retry')}>
          Повторить анализ
        </Button>
      )}
      <h3>AI-анализ</h3>
      <p>{a.analysis?.reason ?? 'Анализ ещё не выполнен.'}</p>
      {a.analysis && (
        <>
          <div className="tags">
            {a.analysis.data.matchingSkills.map((s) => (
              <span className="badge positive" key={s}>
                <Check size={12} />
                {s}
              </span>
            ))}
          </div>
          <p className="muted">
            Не хватает: {a.analysis.data.missingSkills.join(', ') || 'не выявлено'}
          </p>
          <p className="muted">Риски: {a.analysis.data.risks.join('; ') || 'не указаны'}</p>
        </>
      )}
      <h3>Описание вакансии</h3>
      <div className="vacancy-description">{a.vacancy.description}</div>
      <h3>Сопроводительное письмо</h3>
      <textarea
        value={letter}
        onChange={(e) => setLetter(e.target.value)}
        rows={7}
        placeholder="Письмо ещё не подготовлено"
      />
      <div className="actions">
        <Button
          variant="outline"
          disabled={busy || !letter}
          onClick={() => void action('letter', { text: letter })}
        >
          Сохранить текст
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void action('letter')}>
          <Sparkles size={15} />
          Сгенерировать заново
        </Button>
      </div>
      <h3>Вопрос работодателя</h3>
      <p className="muted">Вставьте вопрос с hh.ru. Ответ будет подготовлен для вашей проверки.</p>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} />
      <Button
        disabled={busy || question.length < 3}
        variant="outline"
        onClick={() => void action('question', { text: question })}
      >
        Классифицировать и подготовить ответ
      </Button>
      {a.questions?.map((q) => (
        <div className="question" key={q.id}>
          <strong>
            {q.category}: {q.text}
          </strong>
          <p>{q.answer?.text ?? 'Требуется ваше участие'}</p>
        </div>
      ))}
      <h3>Обратная связь</h3>
      <textarea
        placeholder="Почему вакансия не подходит или что AI оценил неверно?"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
      />
      <div className="actions">
        <Button
          variant="outline"
          disabled={busy || feedback.length < 3}
          onClick={() => void action('feedback', { text: feedback })}
        >
          Сохранить для AI
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void action('blacklist')}>
          Исключить работодателя
        </Button>
      </div>
      <h3>История</h3>
      {a.events?.map((e) => (
        <p className="history-item" key={e.id}>
          <small>{date(e.createdAt)}</small>
          {e.message}
        </p>
      ))}
    </Modal>
  );
}
function Applications() {
  const [mode, setMode] = useState('kanban'),
    [selected, setSelected] = useState<Application | null>(null);
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ['applications'],
    queryFn: () => api<Application[]>('applications'),
  });
  const columns = [
    ['PENDING', 'Ожидают отправки'],
    ['SENT', 'Отправлены'],
    ['VIEWED', 'Просмотрены'],
    ['INVITATION', 'Приглашения'],
    ['ASSIGNMENT', 'Тестовые задания'],
    ['REJECTED', 'Отказы'],
    ['ARCHIVE', 'Архив'],
  ];
  return (
    <>
      <div className="toolbar">
        <p className="muted">Статусы после отправки отмечаются вручную.</p>
        <div className="segmented">
          {['kanban', 'table'].map((m) => (
            <button className={mode === m ? 'active' : ''} key={m} onClick={() => setMode(m)}>
              {m === 'kanban' ? 'Доска' : 'Таблица'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'kanban' ? (
        <div className="kanban">
          {columns.map(([key, label]) => {
            const apps = data.data?.filter((a) => a.pipeline === key) ?? [];
            return (
              <section key={key}>
                <h3>
                  {label}
                  <span>{apps.length}</span>
                </h3>
                {apps.map((a) => (
                  <button className="kanban-card" key={a.id} onClick={() => setSelected(a)}>
                    <small>{a.vacancy.employer}</small>
                    <strong>{a.vacancy.title}</strong>
                    <span>{salary(a.vacancy)}</span>
                    <span className="score">{a.analysis?.score ?? '—'}%</span>
                  </button>
                ))}
                {!apps.length && <p className="kanban-empty">Пока пусто</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Вакансия</th>
                <th>Статус</th>
                <th>Источник</th>
                <th>Изменить этап</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button className="cell-title" onClick={() => setSelected(a)}>
                      {a.vacancy.title}
                    </button>
                  </td>
                  <td>{statuses[a.status]}</td>
                  <td>{a.resultSource === 'USER_REPORTED' ? 'Со слов пользователя' : '—'}</td>
                  <td>
                    <select
                      aria-label="Этап отклика"
                      disabled={!a.appliedAt}
                      value={a.pipeline}
                      onChange={async (e) => {
                        try {
                          await api(`applications/${a.id}/pipeline`, 'POST', {
                            pipeline: e.target.value,
                          });
                          await qc.invalidateQueries();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      {[...columns, ['INTERVIEW', 'Собеседование'], ['OFFER', 'Оффер']].map(
                        ([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.data?.length && <Empty title="Откликов пока нет" />}
        </div>
      )}
      {selected && <VacancyModal a={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
function Profiles() {
  const data = useQuery({
      queryKey: ['search-profiles'],
      queryFn: () => api<SearchProfile[]>('search-profiles'),
    }),
    qc = useQueryClient();
  const [editing, setEditing] = useState<SearchProfile | 'new' | null>(null);
  return (
    <>
      <div className="toolbar">
        <span className="muted">{data.data?.length ?? 0} профилей поиска</span>
        <Button onClick={() => setEditing('new')}>
          <Plus size={17} />
          Создать профиль
        </Button>
      </div>
      <div className="profile-grid">
        {data.data?.map((p) => (
          <div className="panel profile-card" key={p.id}>
            <div className="panel-title">
              <span className="profile-symbol">
                <SlidersHorizontal size={22} />
              </span>
              <label className="switch">
                <input
                  aria-label={`Активировать ${p.name}`}
                  type="checkbox"
                  checked={p.active}
                  onChange={async (e) => {
                    try {
                      await api('search-profiles/' + p.id, 'PATCH', { active: e.target.checked });
                      await qc.invalidateQueries();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                />
                <span />
              </label>
            </div>
            <h2>{p.name}</h2>
            <p>{p.query}</p>
            <div className="profile-details">
              <span>
                AI-рейтинг от <b>{p.minScore}%</b>
              </span>
              <span>
                Лимит в день <b>{p.dailyLimit}</b>
              </span>
              <span>
                Проверка каждые <b>{p.intervalMinutes} мин.</b>
              </span>
              <span>
                Режим <b>{p.mode === 'AUTO' ? 'Авто + ручное завершение' : 'С подтверждением'}</b>
              </span>
            </div>
            <Button variant="outline" onClick={() => setEditing(p)}>
              Редактировать
            </Button>
          </div>
        ))}
      </div>
      {!data.data?.length && (
        <div className="panel">
          <Empty title="Поиск начинается с ваших правил">
            <p>Сначала добавьте резюме, затем создайте профиль поиска.</p>
            <Link href="/resumes" className="text-link">
              Добавить резюме
            </Link>
          </Empty>
        </div>
      )}
      {editing && (
        <Modal
          title={editing === 'new' ? 'Новый поисковый профиль' : 'Настройки поиска'}
          onClose={() => setEditing(null)}
        >
          <SearchForm
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  );
}
function Resumes() {
  const [editing, setEditing] = useState<Resume | 'new' | null>(null);
  const data = useQuery({ queryKey: ['resumes'], queryFn: () => api<Resume[]>('resumes') });
  return (
    <>
      <div className="notice">
        <FileUser size={18} />
        <p>
          Список собственных резюме не описан в текущей public OpenAPI. Добавьте текст резюме
          вручную и подтвердите достоверность.
        </p>
      </div>
      <div className="toolbar">
        <h2>Мои резюме</h2>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} />
          Добавить резюме
        </Button>
      </div>
      <div className="profile-grid">
        {data.data?.map((r) => (
          <div className="panel profile-card" key={r.id}>
            <FileUser className="blue" size={27} />
            <h2>{r.title}</h2>
            <div className="tags">
              {r.skills.map((s) => (
                <span className="badge" key={s}>
                  {s}
                </span>
              ))}
            </div>
            <p className="muted">{r.geography || 'География не указана'}</p>
            <small className="muted">Обновлено {date(r.updatedAt)}</small>
            <Button variant="outline" onClick={() => setEditing(r)}>
              Редактировать
            </Button>
          </div>
        ))}
      </div>
      {!data.data?.length && (
        <div className="panel">
          <Empty title="Добавьте ваш реальный опыт">
            <p>AI будет выбирать подходящее резюме для каждой вакансии.</p>
          </Empty>
        </div>
      )}
      <CandidateForm />
      {editing && (
        <Modal title="Подтверждённое резюме" onClose={() => setEditing(null)}>
          <ResumeForm
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  );
}
function Attention() {
  const data = useQuery({ queryKey: ['tasks'], queryFn: () => api<Task[]>('tasks') }),
    qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const tasks = data.data?.filter((t) => showDone || !t.completedAt) ?? [];
  return (
    <>
      <div className="toolbar">
        <span className="badge">{tasks.length} задач</span>
        <label className="inline-label">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Показать завершённые
        </label>
      </div>
      <div className="task-list">
        {tasks.map((t) => (
          <article id={'task-' + t.id} className="panel task-card" key={t.id}>
            <div className="task-icon">
              <Inbox size={21} />
            </div>
            <div>
              <div className="tags">
                <span className="badge">{t.type}</span>
                <span className={t.priority === 'HIGH' ? 'badge warning' : 'badge'}>
                  {t.priority === 'HIGH' ? 'Высокий приоритет' : 'Обычный приоритет'}
                </span>
                {t.deadline && <span className="badge warning">До {date(t.deadline)}</span>}
              </div>
              <h3>{t.title}</h3>
              {t.application && (
                <strong>
                  {t.application.vacancy.title} / {t.application.vacancy.employer}
                </strong>
              )}
              <p>{t.description}</p>
              <div className="actions">
                {t.application && (
                  <a
                    className="btn btn-outline"
                    href={t.application.vacancy.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Открыть hh.ru
                    <ExternalLink size={14} />
                  </a>
                )}
                {t.type === 'AUTH' && (
                  <Link className="btn btn-primary" href="/settings">
                    Подключить hh.ru
                  </Link>
                )}
                {['APPROVAL', 'REVIEW'].includes(t.type) && (
                  <Link className="btn btn-primary" href="/vacancies">
                    Проверить отклик
                  </Link>
                )}
                <Button
                  disabled={!!t.completedAt}
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api('tasks/' + t.id, 'PATCH', {});
                      await qc.invalidateQueries();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Check size={15} />
                  {t.completedAt ? 'Выполнено' : 'Отметить выполненной'}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!tasks.length && (
        <div className="panel">
          <Empty title="Всё под контролем">
            <p>Когда понадобится ваше участие, задача появится здесь.</p>
          </Empty>
        </div>
      )}
    </>
  );
}
function Analytics({ d }: { d: Dashboard }) {
  const [recommendations, setRecommendations] = useState<{ text: string; sampleSize: number }[]>(
      [],
    ),
    [recommending, setRecommending] = useState(false);
  const responses = d.applications.filter((a) => a.appliedAt && a.respondedAt);
  const meanHours = responses.length
    ? Math.round(
        responses.reduce(
          (sum, a) =>
            sum + (new Date(a.respondedAt!).getTime() - new Date(a.appliedAt!).getTime()) / 3600000,
          0,
        ) / responses.length,
      )
    : null;
  const invitations = d.applications.filter(
    (a) => ['INVITATION', 'INTERVIEW', 'OFFER'].includes(a.pipeline) && a.analysis,
  );
  const meanScore = invitations.length
    ? Math.round(invitations.reduce((sum, a) => sum + a.analysis!.score, 0) / invitations.length)
    : null;
  const resumeGroups = Object.values(
    d.applications
      .filter((a) => a.appliedAt)
      .reduce<Record<string, { name: string; total: number; invited: number }>>((acc, a) => {
        const key = a.resume?.id ?? 'unknown';
        const group = (acc[key] ??= {
          name: a.resume?.title ?? 'Не указано',
          total: 0,
          invited: 0,
        });
        group.total++;
        if (['INVITATION', 'INTERVIEW', 'OFFER'].includes(a.pipeline)) group.invited++;
        return acc;
      }, {}),
  );
  const letterGroups = [true, false].map((has) => {
    const apps = d.applications.filter((a) => a.appliedAt && !!a.letter === has);
    return {
      name: has ? 'С письмом' : 'Без письма',
      total: apps.length,
      invited: apps.filter((a) => ['INVITATION', 'INTERVIEW', 'OFFER'].includes(a.pipeline)).length,
    };
  });
  const applied = d.applications.filter((a) => a.appliedAt),
    pct = (n: number) => (applied.length ? Math.round((n / applied.length) * 100) + '%' : '—');
  const groups = Object.values(
    d.applications.reduce<Record<string, { name: string; total: number; invited: number }>>(
      (acc, a) => {
        const x = (acc[a.searchId] ??= { name: a.search.name, total: 0, invited: 0 });
        if (a.appliedAt) x.total++;
        if (['INVITATION', 'INTERVIEW', 'OFFER'].includes(a.pipeline)) x.invited++;
        return acc;
      },
      {},
    ),
  );
  return (
    <>
      <div className="metric-grid four">
        {[
          ['Отправлено откликов', d.kpi.applied],
          ['Процент просмотров', pct(d.kpi.viewed)],
          ['Процент приглашений', pct(d.kpi.invited)],
          ['Процент отказов', pct(d.kpi.rejected)],
          ['Среднее время ответа', meanHours === null ? '—' : meanHours + ' ч'],
          ['AI Score приглашённых', meanScore === null ? '—' : meanScore + '%'],
        ].map(([label, val]) => (
          <div className="metric" key={label}>
            <div>{label}</div>
            <strong>{val}</strong>
            <small>По сохранённым данным</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <Chart applications={d.applications} />
        <Funnel d={d} />
      </div>
      <div className="panel">
        <div className="panel-title">
          <h2>Эффективность поисковых профилей</h2>
          <a download className="text-link" href="/api/export">
            <Download size={15} />
            Скачать CSV
          </a>
        </div>
        <table>
          <thead>
            <tr>
              <th>Профиль</th>
              <th>Отклики</th>
              <th>Приглашения</th>
              <th>Конверсия</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.name}>
                <td>{g.name}</td>
                <td>{g.total}</td>
                <td>{g.invited}</td>
                <td>
                  {g.total >= 30
                    ? Math.round((g.invited / g.total) * 100) + '%'
                    : 'Недостаточно данных'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!groups.length && <Empty title="Данные появятся после начала поиска" />}
      </div>
      <div className="notice">
        <Sparkles size={20} />
        <div>
          <strong>Рекомендации по результатам поиска</strong>
          <div className="actions">
            <Button
              variant="outline"
              disabled={recommending || groups.filter((g) => g.total >= 30).length < 2}
              onClick={async () => {
                setRecommending(true);
                try {
                  const result = await api<{
                    recommendations: { text: string; sampleSize: number }[];
                  }>('analytics/recommendations', 'POST', {});
                  setRecommendations(result.recommendations);
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setRecommending(false);
                }
              }}
            >
              <Sparkles size={15} />
              Сформировать AI-рекомендации
            </Button>
          </div>
          {recommendations.map((r, i) => (
            <p key={i}>
              {r.text} <small>Выборка: {r.sampleSize} откликов.</small>
            </p>
          ))}
          <p>
            {groups.every((g) => g.total < 30)
              ? 'Для сравнения нужно хотя бы 30 откликов в каждом профиле. Пока статистических выводов нет.'
              : 'Доступна описательная статистика в таблице. Различия конверсии не доказывают причинную связь.'}
          </p>
        </div>
      </div>
      {[
        ['Эффективность резюме', resumeGroups],
        ['Эффективность писем', letterGroups],
      ].map(([title, rows]) => (
        <div className="panel" key={String(title)}>
          <div className="panel-title">
            <h2>{String(title)}</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Вариант</th>
                  <th>Отклики</th>
                  <th>Приглашения</th>
                  <th>Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {(rows as { name: string; total: number; invited: number }[]).map((g) => (
                  <tr key={g.name}>
                    <td>{g.name}</td>
                    <td>{g.total}</td>
                    <td>{g.invited}</td>
                    <td>
                      {g.total >= 30
                        ? Math.round((g.invited / g.total) * 100) + '%'
                        : 'Недостаточно данных'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="panel cost-panel">
        <h2>Использование AI</h2>
        <p>
          Входящие токены: {(d.usage.inputTokens ?? 0).toLocaleString('ru')} / Исходящие:{' '}
          {(d.usage.outputTokens ?? 0).toLocaleString('ru')}
        </p>
        <p className="muted">
          Бюджет с резервами: $
          {((d.usage.estimatedCost ?? 0) + (d.usage.reservedCost ?? 0)).toFixed(4)}. Задайте
          актуальные цены провайдера в настройках.
        </p>
      </div>
    </>
  );
}
function Activity() {
  const data = useQuery({
    queryKey: ['activity'],
    queryFn: () =>
      api<{ id: string; kind: string; message: string; createdAt: string }[]>('activity'),
  });
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Журнал действий</h2>
        <span className="badge">Последние 500 событий</span>
      </div>
      {data.data?.map((e) => (
        <div className="activity-row" key={e.id}>
          <span className="activity-dot" />
          <time>{date(e.createdAt)}</time>
          <span className="badge">{e.kind}</span>
          <p>{e.message}</p>
        </div>
      ))}
      {!data.data?.length && (
        <Empty title="История пока пуста">
          <p>Решения AI, проверки и ваши действия будут сохранены здесь.</p>
        </Empty>
      )}
    </div>
  );
}
