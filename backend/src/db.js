const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/quickdrop';

// Configure SSL for managed Postgres providers (Render, Heroku, etc.).
// Set DB_SSL=true in Render environment to enable ssl with rejectUnauthorized=false.
const poolConfig = { connectionString };

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  console.error('Postgres client error:', error);
});

module.exports = pool;
