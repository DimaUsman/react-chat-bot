import express from 'express';
import cors from 'cors';
import { config, describeDatabaseUrl } from './config.js';
import { migrate, pool } from './db.js';
import routes from './routes.js';

const app = express();

const corsOrigin = config.corsOrigin;
app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

async function start() {
  console.log(`DB target: ${describeDatabaseUrl()}`);
  const corsLabel = Array.isArray(corsOrigin)
    ? corsOrigin.join(', ')
    : String(corsOrigin);
  console.log(`CORS origin: ${corsLabel}`);
  await migrate();
  app.listen(config.port, config.host, () => {
    console.log(`API http://${config.host}:${config.port}`);
  });
}

start().catch(async (err) => {
  console.error('Failed to start:', err.message);
  console.error(
    'Check DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_HOST/POSTGRES_DB in --env-file / -e',
  );
  console.error(`Resolved DB: ${describeDatabaseUrl()}`);
  await pool.end();
  process.exit(1);
});
