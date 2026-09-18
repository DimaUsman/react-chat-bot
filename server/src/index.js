import express from 'express';
import cors from 'cors';
import { config, describeDatabaseUrl } from './config.js';
import { migrate, pool } from './db.js';
import routes from './routes.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

async function start() {
  console.log(`DB target: ${describeDatabaseUrl()}`);
  await migrate();
  app.listen(config.port, () => {
    console.log(`API http://localhost:${config.port}`);
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
