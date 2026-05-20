let io = null;

// Track uploader socket associations: { fileId: socketId }
const uploaderSockets = new Map();

// Track viewer counts per file: { fileId: count }
const viewerCounts = new Map();

/**
 * Initialize Socket.IO server
 */
function initializeSocket(server) {
  io = require('socket.io')(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Track uploader socket association
    socket.on('registerUploader', (fileId) => {
      uploaderSockets.set(fileId, socket.id);
      console.log(`[Socket] Uploader registered for file: ${fileId}`);
    });

    // Join file viewer room
    socket.on('joinFile', (fileId) => {
      socket.join(fileId);
      viewerCounts.set(fileId, (viewerCounts.get(fileId) || 0) + 1);
      console.log(`[Socket] Client joined file room: ${fileId} (count: ${viewerCounts.get(fileId)})`);

      // Update viewer count for all clients
      io.to(fileId).emit('viewerCountUpdate', { fileId, count: viewerCounts.get(fileId) });
    });

    // Leave file viewer room
    socket.on('leaveFile', (fileId) => {
      socket.leave(fileId);
      if (viewerCounts.has(fileId)) {
        viewerCounts.set(fileId, viewerCounts.get(fileId) - 1);
        if (viewerCounts.get(fileId) <= 0) {
          viewerCounts.delete(fileId);
        } else {
          io.to(fileId).emit('viewerCountUpdate', { fileId, count: viewerCounts.get(fileId) });
        }
      }
      console.log(`[Socket] Client left file room: ${fileId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);

      // Clean up uploader socket
      for (const [fileId, socketId] of uploaderSockets) {
        if (socketId === socket.id) {
          uploaderSockets.delete(fileId);
          console.log(`[Socket] Uploader socket cleaned up for file: ${fileId}`);
        }
      }

      // Clean up viewer counts (simplified - real cleanup happens on leaveFile)
    });
  });

  return io;
}

/**
 * Get Socket.IO instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket() first.');
  }
  return io;
}

/**
 * Emit upload progress event
 */
function emitUploadProgress(fileId, progress) {
  if (!io) return;
  io.emit('uploadProgress', { fileId, progress });
}

/**
 * Emit file uploaded event
 */
function emitFileUploaded(fileId, data) {
  if (!io) return;
  io.emit('fileUploaded', { fileId, data });
}

/**
 * Emit download notification to uploader
 */
function emitDownloadNotification(fileId, downloadData) {
  const uploaderSocketId = uploaderSockets.get(fileId);
  if (uploaderSocketId && io) {
    io.to(uploaderSocketId).emit('downloadNotification', {
      fileId,
      ...downloadData,
    });
    console.log(`[Socket] Download notification sent to uploader for file: ${fileId}`);
  }
}

/**
 * Emit viewer count update to file room
 */
function emitViewerCountUpdate(fileId, count) {
  if (!io) return;
  io.to(fileId).emit('viewerCountUpdate', { fileId, count });
}

// Track expiration info for files: { fileId: { expiresAt, lastNotified } }
const expirationTracking = new Map();

/**
 * Get current viewer count for a file
 */
function getViewerCount(fileId) {
  return viewerCounts.get(fileId) || 0;
}

/**
 * Get expiration time from database for a file
 */
async function getFileExpirationFromDB(fileId) {
  const pool = require('./db');
  try {
    const result = await pool.query(
      'SELECT expiration_timestamp FROM files WHERE id = $1',
      [fileId]
    );
    if (result.rows.length > 0) {
      return new Date(result.rows[0].expiration_timestamp);
    }
    return null;
  } catch (error) {
    console.error(`[Expiration] Error fetching expiration for ${fileId}:`, error.message);
    return null;
  }
}

/**
 * Get all files that are about to expire (within next 60 seconds)
 */
async function getFilesAboutToExpire() {
  const pool = require('./db');
  const now = new Date();
  const aboutToExpire = [];

  try {
    // If we're not tracking any files, return early to avoid building an empty IN list
    if (expirationTracking.size === 0) {
      return aboutToExpire;
    }

    // Get files expiring within next 60 seconds that we're tracking
    const trackedIds = Array.from(expirationTracking.keys()).map(id => `'${id}'`).join(',');
    const result = await pool.query(
      `SELECT id, expiration_timestamp FROM files
       WHERE expiration_timestamp > NOW()
       AND expiration_timestamp <= NOW() + INTERVAL '60 seconds'
       AND id IN (${trackedIds})`
    );

    for (const row of result.rows) {
      const expiresAt = new Date(row.expiration_timestamp);
      const diff = expiresAt - now;
      if (diff > 0 && diff <= 60000) {
        aboutToExpire.push({ fileId: row.id, diff, expiresAt });
      }
    }
  } catch (error) {
    console.error('[Expiration] Error fetching files about to expire:', error.message);
  }

  return aboutToExpire;
}

/**
 * Emit expiration updates to all connected clients
 */
async function emitExpirationUpdates() {
  if (!io) return;

  const filesToUpdate = await getFilesAboutToExpire();

  for (const { fileId, diff, expiresAt } of filesToUpdate) {
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    io.to(fileId).emit('expirationUpdate', {
      fileId,
      timeRemaining: diff,
      isExpired: diff <= 0,
      formattedTime:
        hours > 0
          ? `${hours}h ${minutes}m ${seconds}s`
          : minutes > 0
          ? `${minutes}m ${seconds}s`
          : `${seconds}s`,
    });
  }
}

/**
 * Start expiration tracking for a file
 */
function startExpirationTracking(fileId, expiresAt) {
  expirationTracking.set(fileId, {
    expiresAt,
    lastNotified: new Date(),
  });
  console.log(`[Expiration] Started tracking for file: ${fileId}, expires: ${expiresAt}`);
}

/**
 * Stop expiration tracking for a file
 */
function stopExpirationTracking(fileId) {
  expirationTracking.delete(fileId);
  console.log(`[Expiration] Stopped tracking for file: ${fileId}`);
}

/**
 * Initialize periodic expiration check (runs every 5 seconds for better precision)
 */
function initializeExpirationCheck() {
  console.log('[Expiration] Starting expiration check interval');
  // Run every 5 seconds for better precision
  setInterval(async () => {
    await emitExpirationUpdates();
  }, 5000);
}

module.exports = {
  initializeSocket,
  getIO,
  emitUploadProgress,
  emitFileUploaded,
  emitDownloadNotification,
  emitViewerCountUpdate,
  getViewerCount,
  startExpirationTracking,
  stopExpirationTracking,
  initializeExpirationCheck,
  getFileExpirationFromDB,
  getFilesAboutToExpire,
  emitExpirationUpdates,
};
