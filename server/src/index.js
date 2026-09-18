import express from 'express';
import cors from 'cors';
import { config } from './config.js';
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
  await migrate();
  app.listen(config.port, () => {
    console.log(`API http://localhost:${config.port}`);
    console.log(`DB   ${config.databaseUrl.replace(/:[^:@/]+@/, ':***@')}`);
  });
}

start().catch(async (err) => {
  console.error('Failed to start:', err.message);
  await pool.end();
  process.exit(1);
});
