import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Local monorepo .env (внутри Docker этих файлов обычно нет — берём из --env-file / -e)
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.example') });

export function assertSafeSchemaName(name) {
  const schema = String(name || 'dataoffice_chat_bot').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error(
      `Invalid DATABASE_SCHEMA "${schema}". Use letters, digits, underscore only.`,
    );
  }
  return schema;
}

function buildDatabaseUrlFromParts() {
  const user = process.env.POSTGRES_USER || process.env.PGUSER;
  const password = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || '';
  const host = process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost';
  const port = process.env.POSTGRES_PORT || process.env.PGPORT || '5432';
  const db = process.env.POSTGRES_DB || process.env.PGDATABASE || 'chatbot';

  if (!user) return null;

  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);

  return `postgresql://${auth}@${host}:${port}/${db}`;
}

/** URL пригоден, если в нём есть имя пользователя (не шаблон USER / ${...}). */
function isUsableDatabaseUrl(url) {
  if (!url) return false;
  if (/\$\{|USER:PASSWORD|PG_HOST|DB_NAME/.test(url)) return false;
  try {
    const u = new URL(url);
    return Boolean(u.username && decodeURIComponent(u.username).trim());
  } catch {
    return false;
  }
}

function resolveDatabaseUrl() {
  const fromUrl = (process.env.DATABASE_URL || '').trim();
  if (isUsableDatabaseUrl(fromUrl)) return fromUrl;

  const built = buildDatabaseUrlFromParts();
  if (built) return built;

  // Последний fallback только для локальной разработки без .env
  return 'postgresql://chatbot:chatbot@localhost:5432/chatbot';
}

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: resolveDatabaseUrl(),
  databaseSchema: assertSafeSchemaName(
    process.env.DATABASE_SCHEMA || 'dataoffice_chat_bot',
  ),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  visitorTtlDays: Number(process.env.VISITOR_TTL_DAYS || 14),
  supportLogins: (process.env.SUPPORT_LOGINS || 'support,admin')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  pachcaWebhookUrl: process.env.PACHCA_WEBHOOK_URL || '',
};

/** Безопасное описание БД для логов (без пароля). */
export function describeDatabaseUrl(url = config.databaseUrl) {
  try {
    const u = new URL(url);
    const user = u.username ? decodeURIComponent(u.username) : '(no user)';
    return `${u.protocol}//${user}:***@${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(invalid DATABASE_URL)';
  }
}
