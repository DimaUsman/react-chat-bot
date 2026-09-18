# react-chat-bot

Встраиваемый чат **КОРОБКО-КОТ** + API + админ-панель доступа к отчётам (React + Express + PostgreSQL).

## Куда указать креды

1. `copy .env.example .env`
2. Корневой `.env`:

| Переменная | Для чего |
|------------|----------|
| `POSTGRES_*` | Docker Postgres |
| `DATABASE_URL` | API/Admin на хосте |
| `DATABASE_SCHEMA` | схема Postgres (по умолчанию `dataoffice_chat_bot`, не `public`) |
| `PACHCA_WEBHOOK_URL` | уведомления в Пачку |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | вход в админку |
| `ADMIN_PUBLIC_URL` | URL админки для картинок отчётов в чате |

## Быстрый старт

```bash
copy .env.example .env
npm run db:up

npm run api:build && npm run api:up
npm run admin:build && npm run admin:up

npm run install:all
npm run dev:client
```

- Чат: http://localhost:5173  
- API: http://localhost:3001/api/health  
- Админка: http://localhost:3002 (логин/пароль из `.env`, по умолчанию `admin` / `admin`)

## Деплой

Пошагово: [docs/DEPLOY.md](docs/DEPLOY.md) — Docker API/Admin на app-сервере, Postgres на отдельном, встраивание `<ChatWidget />` в систему отчётов.

- В `.env`: `DATABASE_SCHEMA=dataoffice_chat_bot` (любое безопасное имя)
- Шаблон миграций: `server/db/schema.sql` (`{{SCHEMA}}` подставляется при старте)
- Быстро воссоздать вручную (DBeaver/psql): `server/db/recreate_schema.sql`

| Файл | Сервис |
|------|--------|
| `docker-compose.yml` | только Postgres |
| `Dockerfile.api` | API чата |
| `Dockerfile.admin` | веб-сервис пользователей/групп/отчётов |

## Админка

- Пользователи и роли
- Группы
- Таблица **user_groups** — наличие у пользователя группы
- Таблица **group_report_access** — права группы на отчёт
- Отчёты: картинка, описание, источник данных, список страниц

В чате остаётся только **просмотр** отчётов, к которым есть доступ через группы.

## Структура

```
Dockerfile.api
Dockerfile.admin
docker-compose.yml
client/          # виджет КОРОБКО-КОТ
server/          # API чата
admin/           # админ-панель
docs/
```
