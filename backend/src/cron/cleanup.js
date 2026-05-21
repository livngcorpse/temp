require('dotenv').config();
const pool = require('../db');
const { deleteStorageFile } = require('../storage');

/**
 * Clean up expired files from database and filesystem
 */
async function cleanupExpiredFiles() {
  try {
    console.log('[Cron] Starting cleanup of expired files...');

    // First, get all expired files from database
    const result = await pool.query(`
      SELECT id, file_name, original_name
      FROM files
      WHERE expiration_timestamp < NOW()
    `);

    if (result.rows.length === 0) {
      console.log('[Cron] No expired files found');
      return;
    }

    console.log(`[Cron] Found ${result.rows.length} expired files to clean up`);

    // Delete each file from filesystem and database
    for (const file of result.rows) {
      try {
        await deleteStorageFile(file.file_name);
        console.log(`[Cron] Deleted file from cloud storage: ${file.file_name}`);
      } catch (err) {
        console.error(`[Cron] Failed to delete file from cloud storage: ${file.file_name}`, err.message);
      }

      // Delete from database
      try {
        await pool.query('DELETE FROM files WHERE id = $1', [file.id]);
        console.log(`[Cron] Deleted file from database: ${file.id}`);
      } catch (err) {
        console.error(`[Cron] Failed to delete file from database: ${file.id}`, err.message);
      }
    }

    console.log('[Cron] Cleanup completed successfully');
  } catch (error) {
    console.error('[Cron] Cleanup failed:', error.message);
  }
}

/**
 * Check if a specific file is expired
 */
async function isFileExpired(fileId) {
  try {
    const result = await pool.query(
      'SELECT expiration_timestamp FROM files WHERE id = $1',
      [fileId]
    );

    if (result.rows.length === 0) {
      return null; // File not found
    }

    const expiresAt = new Date(result.rows[0].expiration_timestamp);
    return new Date() > expiresAt;
  } catch (error) {
    console.error('[Cron] Error checking file expiration:', error.message);
    return null;
  }
}

/**
 * Get all expired files (returns metadata without deleting)
 */
async function getExpiredFiles() {
  try {
    const result = await pool.query(`
      SELECT id, original_name, file_name, expiration_timestamp, download_count
      FROM files
      WHERE expiration_timestamp < NOW()
    `);
    return result.rows;
  } catch (error) {
    console.error('[Cron] Error fetching expired files:', error.message);
    return [];
  }
}

/**
 * Initialize the cleanup cron job
 * Runs every 5 minutes by default
 */
function initializeCronJob(intervalMinutes = 5) {
  console.log(`[Cron] Initialized - running every ${intervalMinutes} minute(s)`);

  // Run immediately on startup
  cleanupExpiredFiles();

  // Then run periodically
  return setInterval(() => {
    cleanupExpiredFiles();
  }, intervalMinutes * 60 * 1000);
}

module.exports = {
  cleanupExpiredFiles,
  isFileExpired,
  getExpiredFiles,
  initializeCronJob,
};
