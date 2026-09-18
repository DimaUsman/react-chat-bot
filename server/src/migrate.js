import { migrate } from './db.js';

await migrate();
console.log('Migrations applied');
process.exit(0);
