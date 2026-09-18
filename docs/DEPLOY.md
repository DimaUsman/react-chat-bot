# Деплой: API + Admin + удалённый Postgres + виджет в существующем React

## Архитектура

```
┌─────────────────────────────┐     ┌──────────────────────┐
│  Сервер приложений (Docker) │     │  Сервер Postgres     │
│  - react-chat-bot-api :3001 │────►│  DATABASE_URL        │
│  - react-chat-bot-admin:3002│     │  schema: dataoffice_ │
└──────────────┬──────────────┘     │  chat_bot            │
               │                    └──────────────────────┘
               │ /api
               ▼
┌─────────────────────────────┐
│  Система отчётов (ваш фронт)│
│  <ChatWidget apiBase=... /> │
└─────────────────────────────┘
```

На сервер приложений **не** ставим Postgres — только API и админку.

---

## 1. Postgres (другой сервер)

1. Создайте БД и пользователя (или используйте существующие).
2. Выполните `server/db/recreate_schema.sql` в DBeaver/psql  
   (или дайте API создать схему при первом старте — он применит `schema.sql`).
3. Проверьте доступ **с сервера приложений** до Postgres (порт 5432, firewall, `pg_hba.conf`).

Строка подключения (пример):

```env
DATABASE_URL=postgresql://USER:PASSWORD@PG_HOST:5432/DB_NAME
DATABASE_SCHEMA=dataoffice_chat_bot
```

---

## 2. .env на сервере приложений

Скопируйте `.env.example` → `.env` и заполните **прод**.

Вариант A — одна строка:

```env
DATABASE_URL=postgresql://real_user:real_password@PG_HOST:5432/DB_NAME
DATABASE_SCHEMA=dataoffice_chat_bot
```

Вариант B — отдельные поля (если `DATABASE_URL` пустой или оставлен шаблоном из `.env.example`):

```env
POSTGRES_USER=real_user
POSTGRES_PASSWORD=real_password
POSTGRES_HOST=PG_HOST
POSTGRES_PORT=5432
POSTGRES_DB=DB_NAME
DATABASE_SCHEMA=dataoffice_chat_bot
```

Важно:

- Docker **не** подставляет `${POSTGRES_USER}` внутри `DATABASE_URL` — пишите готовые значения.
- Файл `.env` в образ **не** копируется: контейнер видит только то, что передали через `--env-file` / `-e`.
- Не оставляйте в `.env` строки вида `postgresql://USER:PASSWORD@PG_HOST:...` — это шаблон, не креды.

Остальные переменные:

```env
PORT=3001
# Origin вашей системы отчётов (можно несколько через запятую — см. ниже)
CORS_ORIGIN=https://reports.example.com

ADMIN_PORT=3002
ADMIN_LOGIN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=длинный-секрет
# Публичный URL админки — для картинок отчётов в чате
ADMIN_PUBLIC_URL=https://chat-admin.example.com

PACHCA_WEBHOOK_URL=https://api.pachca.com/webhooks/...
SUPPORT_LOGINS=support,admin
```

Если контейнер в статусе **Restarting** — смотрите логи:

```bash
docker logs --tail 50 react-chat-bot-api
```

В логе будет строка `DB target: postgresql://user:***@host:5432/db`. Если user = `(no user)` или host = `localhost` / `PG_HOST` — поправьте `.env` и пересоздайте контейнер с `--env-file .env`.

---

## 3. Сборка и запуск Docker (сервер приложений)

На машине с Docker (или в CI):

```bash
# из корня репозитория
docker build -f Dockerfile.api -t react-chat-bot-api ./server
docker build -f Dockerfile.admin -t react-chat-bot-admin .

# API
docker run -d --name react-chat-bot-api --restart unless-stopped \
  -p 3001:3001 \
  --env-file .env \
  react-chat-bot-api

# Admin (картинки отчётов в volume)
mkdir -p admin/uploads
docker run -d --name react-chat-bot-admin --restart unless-stopped \
  -p 3002:3002 \
  --env-file .env \
  -v "$(pwd)/admin/uploads:/app/uploads" \
  react-chat-bot-admin
```

Проверка:

- `http://APP_HOST:3001/api/health` → `{"ok":true}`
- `http://APP_HOST:3002/login` → форма входа админки

Перед фронтом обычно ставят nginx/traefik:

| Публичный URL | Куда |
|---------------|------|
| `https://chat-api.example.com` | `localhost:3001` |
| `https://chat-admin.example.com` | `localhost:3002` |

---

## 4. CORS

В API сейчас один `CORS_ORIGIN`. Укажите origin системы отчётов, например:

```env
CORS_ORIGIN=https://reports.example.com
```

Если нужно несколько origin — напишите, расширим конфиг.

---

## 5. Встраивание React-компонента в систему отчётов

Виджет — это `ChatWidget`. Его можно подключить как исходники из этого репозитория (или как git submodule / скопировать `client/src`).

### Минимальный пример

```jsx
import ChatWidget from 'react-chat-bot/client/src/ChatWidget.jsx';
// или относительный путь:
// import ChatWidget from '../../react-chat-bot/client/src/ChatWidget.jsx';
import 'react-chat-bot/client/src/styles.css';
// аватар положите в public/ хоста или укажите полный URL:
import korobkoAvatar from './assets/korobko-kot.jpg';

export function ReportsPage({ user, currentReport }) {
  return (
    <>
      {/* ваша существующая страница */}
      <ChatWidget
        apiBase="https://chat-api.example.com"
        avatarUrl={korobkoAvatar}
        context={{
          login: user.login,
          fullname: user.fullname,
          firstname: user.firstname,
          dsNumber: currentReport?.id ?? '',
          dsName: currentReport?.title ?? '',
        }}
      />
    </>
  );
}
```

### Что передать в `context`

| Поле | Смысл |
|------|--------|
| `login` | логин в BI (для прав на отчёты и истории) |
| `fullname` / `firstname` | отображение и welcome |
| `dsNumber` / `dsName` | текущий открытый отчёт |

### Прокси (альтернатива `apiBase`)

Если не хотите CORS, в webpack/vite хоста:

```js
// vite
server: { proxy: { '/api': 'http://chat-api-internal:3001' } }
```

Тогда `apiBase` не нужен (пустая строка).

### Аватар

Скопируйте `client/public/korobko-kot.jpg` в `public/` хост-приложения **или** передайте `avatarUrl`.

---

## 6. Чеклист перед продом

1. Postgres доступен с app-сервера, схема `dataoffice_chat_bot` есть  
2. API health ок, админка логинится  
3. В админке: группы, пользователи, отчёты, картинки  
4. На странице отчётов виден виджет, сообщения уходят в API  
5. `ADMIN_PUBLIC_URL` — тот же публичный URL, что открывает браузер (иначе картинки в чате не откроются)  
6. `PACHCA_WEBHOOK_URL` — уведомления поддержке  

---

## Что куда класть

| Артефакт | Куда |
|----------|------|
| `Dockerfile.api` → контейнер API | сервер приложений |
| `Dockerfile.admin` → контейнер Admin | сервер приложений |
| `.env` | сервер приложений (секреты) |
| Postgres + `recreate_schema.sql` | сервер БД |
| `ChatWidget` + `styles.css` + аватар | репозиторий системы отчётов |
