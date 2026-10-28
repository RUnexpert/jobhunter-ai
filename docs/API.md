# JobHunter AI API

Базовый URL `/api`. JSON. Все маршруты, кроме auth/login, auth/register и health, требуют HttpOnly cookie jh_session. Изменения требуют `Origin`, точно равный origin APP_URL. Ответ ошибки: `{error:string}`. Секреты не возвращаются. OpenAPI: `GET /api/openapi` в авторизованной сессии; можно импортировать в Swagger Editor.

## Контракты

Схемы тел запросов находятся в `src/lib/schemas.ts` и применяются сервером, а не только формой. Неизвестные поля удаляются Zod.

| Запрос                            | Назначение / тело                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| POST /auth/register               | `{email,password,inviteCode}`. Пароль 12–72 символа; код регистрации из окружения                                            |
| POST /auth/login                  | `{email,password}`                                                                                                           |
| POST /auth/logout                 | `{}`; удаляет серверную сессию                                                                                               |
| GET /me                           | Только id и email                                                                                                            |
| GET /dashboard, /analytics        | KPI, реальные applications (макс. 10 000, truncated=true при достижении), расходы и состояние                                |
| GET/POST /search-profiles         | Получение / создание, searchSchema, resumeIds принадлежат пользователю                                                       |
| PATCH /search-profiles/{id}       | Полная searchSchema либо `{active:boolean}`                                                                                  |
| POST /import-search               | `{url}`; локальный разбор параметров HTTPS hh.ru/search/vacancy, без обращения к произвольному URL                           |
| GET/POST /resumes                 | Список / ручной ввод, resumeSchema, USER_CONFIRMED                                                                           |
| PATCH /resumes/{id}               | Обновление resumeSchema                                                                                                      |
| GET/PUT /candidate                | Факты и навыки, candidateSchema                                                                                              |
| GET /vacancies, /applications     | `q`, `status`, `score`, `profile`, `salary`, `since` (YYYY-MM-DD); до 500 записей с анализом, письмом, вопросами и событиями |
| POST /applications/{id}/confirm   | `{confirmed:true}`; ручная отметка отправки, никогда не вызывает hh.ru POST                                                  |
| POST /applications/{id}/skip      | `{}`                                                                                                                         |
| POST /applications/{id}/letter    | `{}` регенерирует; `{text}` сохраняет пользовательский текст                                                                 |
| POST /applications/{id}/question  | `{text}`; классификация и черновик ответа, без отправки                                                                      |
| POST /applications/{id}/feedback  | `{text}`; следующие анализы учитывают обратную связь                                                                         |
| POST /applications/{id}/pipeline  | `{pipeline}`: SENT, VIEWED, INVITATION, ASSIGNMENT, REJECTED, ARCHIVE, INTERVIEW, OFFER. Только после подтверждения отправки |
| POST /applications/{id}/blacklist | `{}`; добавить работодателя в глобальный blacklist                                                                           |
| GET /tasks; PATCH /tasks/{id}     | Центр внимания / отметка завершения                                                                                          |
| GET /activity, /notifications     | Последние 500 событий / 100 уведомлений                                                                                      |
| GET/PUT /providers                | Секреты скрыты; сохранение providerSchema по purpose                                                                         |
| POST /providers/test              | `{purpose}`; реальный JSON-запрос к сохранённой модели, расходует токены                                                     |
| GET/PUT /settings                 | Секрет SMTP скрыт; settingsSchema; пустой пароль сохраняет прежний                                                           |
| POST /agent                       | `{action:START                                                                                                               | PAUSE | STOP | SCAN}`. SCAN требует RUNNING |
| POST /hh/disconnect               | `{}`; удалить локальные токены и остановить агента                                                                           |
| GET /export                       | CSV с BOM, экранированием и защитой от формул, максимум 50 000 строк                                                         |
| GET /events                       | SSE; событие `{refresh:true}` при изменении журнала, heartbeat каждые 5 секунд                                               |
| GET /health                       | Проверка PostgreSQL и Redis                                                                                                  |

OAuth: `GET /api/auth/hh` → hh.ru; callback `/api/auth/hh/callback`. Состояние OAuth одноразовое, живёт 10 минут, привязано к пользователю, session и браузерной cookie.

## Семантика остановки

STOP/PAUSE немедленно сохраняются в PostgreSQL. Обработчики сверяются с текущим состоянием и часами активности перед новым действием. Уже начавшийся HTTP-запрос может завершиться и сохранить результат; отмена внешнего запроса не обещается. Новых запросов на отправку откликов вообще нет, поскольку текущая public OpenAPI не подтверждает такой механизм.

## Источники истины

APPLIED означает ручную отметку пользователя с resultSource=USER_REPORTED. В интерфейсе это явно показано. Статистические сравнения доступны только по накопленной истории; порог описательного сравнения — 30 откликов на профиль. Это не утверждение о статистической значимости.

`POST /analytics/recommendations` формирует AI-рекомендации только при наличии минимум двух профилей с 30 подтверждёнными откликами в каждом. ID профилей и размер выборки проверяются сервером. Используется модель ANALYSIS.

Пароль ограничен 72 байтами UTF-8 (ограничение bcrypt), помимо минимальной длины в 12 символов. `POST /applications/{id}/retry` запускает повторный анализ неотправленной вакансии; требует работающего агента.
