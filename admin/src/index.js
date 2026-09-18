import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, describeDatabaseUrl } from './config.js';
import { migrate, pool } from './db.js';
import apiRoutes from './routes.js';
import {
  checkCredentials,
  createSession,
  setAuthCookie,
  clearAuthCookie,
  destroySession,
  requireAuth,
  COOKIE,
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');
const uploadsDir = path.join(__dirname, '../uploads');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));

app.get('/login', (_req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  if (!checkCredentials(login, password)) {
    return res.status(401).send(`
      <!doctype html><html lang="ru"><body style="font-family:sans-serif;padding:2rem">
      <p>Неверный логин или пароль</p>
      <a href="/login">Назад</a></body></html>
    `);
  }
  const token = createSession();
  setAuthCookie(res, token);
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  destroySession(req.cookies?.[COOKIE]);
  clearAuthCookie(res);
  res.redirect('/login');
});

app.use('/api', requireAuth, apiRoutes);
app.get('/', requireAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.use(express.static(publicDir));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

async function start() {
  console.log(`DB target: ${describeDatabaseUrl()}`);
  await migrate();
  app.listen(config.port, () => {
    console.log(`Admin http://localhost:${config.port}`);
  });
}

start().catch(async (err) => {
  console.error('Failed to start admin:', err.message);
  console.error(
    'Check DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_HOST/POSTGRES_DB in --env-file / -e',
  );
  console.error(`Resolved DB: ${describeDatabaseUrl()}`);
  await pool.end();
  process.exit(1);
});
