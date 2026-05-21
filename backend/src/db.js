const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/quickdrop';

// Configure SSL for managed Postgres providers (Render, Heroku, etc.).
// Set DB_SSL=true in environment to enable ssl with rejectUnauthorized=false.
const poolConfig = { connectionString };

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
} else if (
  connectionString &&
  !connectionString.includes('localhost') &&
  !connectionString.includes('127.0.0.1') &&
  !connectionString.includes('::1')
) {
  poolConfig.ssl = { rejectUnauthorized: false };
  console.log('Postgres SSL mode enabled automatically for remote database connection.');
}

const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  console.error('Postgres client error:', error);
});

module.exports = pool;
