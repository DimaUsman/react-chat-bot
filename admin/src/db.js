import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config, assertSafeSchemaName } from './config.js';

const { Pool } = pg;

const schema = assertSafeSchemaName(config.databaseSchema);

const REQUIRED_TABLES = [
  'visitors',
  'users',
  'conversations',
  'messages',
  'groups',
  'user_groups',
  'reports',
  'group_report_access',
];

export const pool = new Pool({
  connectionString: config.databaseUrl,
  options: `-c search_path=${schema},public`,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSchemaPath() {
  const candidates = [
    path.join(__dirname, '../db/schema.sql'),
    path.join(__dirname, '../../server/db/schema.sql'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('schema.sql not found');
}

function wantForceMigrate() {
  return /^(1|true|yes)$/i.test(String(process.env.FORCE_MIGRATE || ''));
}

async function schemaObjectsExist() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_name = ANY($2::text[])`,
    [schema, REQUIRED_TABLES],
  );
  return rows[0].n >= REQUIRED_TABLES.length;
}

/**
 * DDL — от владельца схемы. App-пользователь с DML при готовых таблицах — skip.
 */
export async function migrate() {
  if (!wantForceMigrate() && (await schemaObjectsExist())) {
    console.log(`[db] schema ready: ${schema} (tables exist, skip DDL)`);
    return;
  }

  const template = fs.readFileSync(resolveSchemaPath(), 'utf8');
  const sql = template.replaceAll('{{SCHEMA}}', schema);
  try {
    await pool.query(sql);
  } catch (err) {
    const msg = err?.message || String(err);
    if (/permission denied|must be owner|insufficient_privilege/i.test(msg)) {
      throw new Error(
        `DDL failed (${msg}). Apply server/db/schema.sql as schema owner, ` +
          `grant DML to the app user, restart. Check DATABASE_SCHEMA=${schema}.`,
      );
    }
    throw err;
  }
  console.log(`[db] schema ready: ${schema}`);
}

export async function query(text, params) {
  return pool.query(text, params);
}
