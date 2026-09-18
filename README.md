# react-chat-bot

Встраиваемый чат поддержки для BI web-сервиса (React + Express + PostgreSQL).

## Куда указать креды PostgreSQL

1. Скопируйте пример:
   ```bash
   copy .env.example .env
   ```
2. Откройте **корневой** файл `.env` и задайте:

| Переменная | Для чего |
|------------|----------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `docker-compose.yml` (только БД) |
| `DATABASE_URL` | API на хосте: `...@localhost:5432/...` |
| `PORT` / `CORS_ORIGIN` / `SUPPORT_LOGINS` | API |

Файл `.env` в git не попадает.

## Быстрый старт

```bash
copy .env.example .env

# 1) Postgres (compose)
npm run db:up

# 2) API — отдельный Dockerfile.api
npm run api:build
npm run api:up

# 3) UI
npm run install:all
npm run dev:client
```

- UI: http://localhost:5173  
- API: http://localhost:3001/api/health  

### Ручной запуск API-контейнера

```bash
docker build -f Dockerfile.api -t react-chat-bot-api ./server

docker run -d --name react-chat-bot-api -p 3001:3001 --env-file .env ^
  -e DATABASE_URL=postgresql://chatbot:chatbot@host.docker.internal:5432/chatbot ^
  react-chat-bot-api
```

`host.docker.internal` нужен, чтобы контейнер API достучался до Postgres на порту хоста.

| Команда | Что делает |
|---------|------------|
| `npm run db:up` | только Postgres (compose) |
| `npm run api:build` / `api:up` | сборка и запуск из `Dockerfile.api` |
| `npm run dev:server` | API на хосте без Docker |

## Память

Гибрид: `visitorId` в `localStorage` + PostgreSQL. См. [docs/MEMORY.md](docs/MEMORY.md).

## Структура

```
docker-compose.yml   # только Postgres
Dockerfile.api       # отдельный образ API
.env.example
server/
client/
docs/
```
