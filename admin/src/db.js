import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config, assertSafeSchemaName } from './config.js';

const { Pool } = pg;

const schema = assertSafeSchemaName(config.databaseSchema);

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

export async function migrate() {
  const template = fs.readFileSync(resolveSchemaPath(), 'utf8');
  const sql = template.replaceAll('{{SCHEMA}}', schema);
  await pool.query(sql);
  console.log(`[db] schema ready: ${schema}`);
}

export async function query(text, params) {
  return pool.query(text, params);
}
