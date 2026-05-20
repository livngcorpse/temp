const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/quickdrop';

const pool = new Pool({ connectionString });

pool.on('error', (error) => {
  console.error('Postgres client error:', error);
});

module.exports = pool;
