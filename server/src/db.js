import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sqlPath = path.join(__dirname, '../db/init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

export async function query(text, params) {
  return pool.query(text, params);
}
