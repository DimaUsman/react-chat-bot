import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.example') });

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://chatbot:chatbot@localhost:5432/chatbot',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  visitorTtlDays: Number(process.env.VISITOR_TTL_DAYS || 14),
  supportLogins: (process.env.SUPPORT_LOGINS || 'support,admin')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
