const { Pool, Client } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'postgres://localhost:5432/quickdrop';
const dbName = 'quickdrop';

async function setupDatabase() {
  // First, connect to postgres system database to create quickdrop database
  const adminPool = new Pool({
    connectionString: 'postgres://postgres:postgres@localhost:5432/postgres',
  });

  try {
    console.log('Creating database if not exists...');
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    console.log('✓ Database created');
  } catch (error) {
    // Check if it's "already exists" error (code 42P04)
    if (error.code === '42P04') {
      console.log('✓ Database already exists');
    } else {
      console.error('✗ Failed to create database:', error.message);
      await adminPool.end();
      process.exit(1);
    }
  }

  await adminPool.end();

  // Now connect to the quickdrop database to create tables
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log('Creating schema...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        original_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100),
        upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expiration_timestamp TIMESTAMP NOT NULL,
        uploader_ip VARCHAR(45),
        password_hash VARCHAR(255),
        download_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✓ Files table created/verified');
    await pool.end();
    console.log('✓ Database setup complete');
  } catch (error) {
    console.error('✗ Schema setup failed:', error.message);
    process.exit(1);
  }
}

setupDatabase();
