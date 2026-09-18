import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

export const config = {
  port: Number(process.env.ADMIN_PORT || 3002),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://chatbot:chatbot@localhost:5432/chatbot',
  databaseSchema: assertSafeSchemaName(
    process.env.DATABASE_SCHEMA || 'dataoffice_chat_bot',
  ),
  adminLogin: process.env.ADMIN_LOGIN || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  sessionSecret: process.env.ADMIN_SESSION_SECRET || 'change-me-admin-secret',
  publicUrl: process.env.ADMIN_PUBLIC_URL || 'http://localhost:3002',
};
