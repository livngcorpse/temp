let io = null;

const { deleteStorageFile } = require('./storage');

// Track uploader socket associations: { fileId: socketId }
const uploaderSockets = new Map();

// Track viewer counts per file: { fileId: count }
const viewerCounts = new Map();
// Track which file rooms each socket has joined: { socketId: Set<fileId> }
const socketFileRooms = new Map();

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

    // Track uploader socket association and send initial state
    socket.on('registerUploader', async (fileId) => {
      uploaderSockets.set(fileId, socket.id);
      console.log(`[Socket] Uploader registered for file: ${fileId}`);

      try {
        // Send current viewer count
        const currentViewers = viewerCounts.get(fileId) || 0;
        io.to(socket.id).emit('viewerCountUpdate', { fileId, count: currentViewers });

        // Fetch download count and expiration from DB
        const pool = require('./db');
        const result = await pool.query('SELECT download_count, expiration_timestamp FROM files WHERE id = $1', [fileId]);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          const downloadCount = row.download_count || 0;
          io.to(socket.id).emit('uploaderState', {
            fileId,
            viewerCount: currentViewers,
            downloadCount,
            expirationTimestamp: row.expiration_timestamp,
          });
        }
      } catch (err) {
        console.error('[Socket] Error fetching uploader initial state:', err.message);
      }
    });

    // Join file viewer room
    socket.on('joinFile', (fileId) => {
      const rooms = socketFileRooms.get(socket.id) || new Set();
      if (!rooms.has(fileId)) {
        socket.join(fileId);
        rooms.add(fileId);
        socketFileRooms.set(socket.id, rooms);
        viewerCounts.set(fileId, (viewerCounts.get(fileId) || 0) + 1);
        console.log(`[Socket] Client joined file room: ${fileId} (count: ${viewerCounts.get(fileId)})`);

        // Update viewer count for all clients
          io.to(fileId).emit('viewerCountUpdate', { fileId, count: viewerCounts.get(fileId) });
          // Also notify uploader directly if registered
          const uploaderSocketId = uploaderSockets.get(fileId);
          if (uploaderSocketId) {
            io.to(uploaderSocketId).emit('viewerCountUpdate', { fileId, count: viewerCounts.get(fileId) });
          }
      }
    });

    // Leave file viewer room
    socket.on('leaveFile', (fileId) => {
      const rooms = socketFileRooms.get(socket.id);
      if (rooms && rooms.has(fileId)) {
        socket.leave(fileId);
        rooms.delete(fileId);
        if (rooms.size === 0) {
          socketFileRooms.delete(socket.id);
        } else {
          socketFileRooms.set(socket.id, rooms);
        }

        if (viewerCounts.has(fileId)) {
          viewerCounts.set(fileId, viewerCounts.get(fileId) - 1);
          const newCount = viewerCounts.get(fileId);
          if (newCount <= 0) {
            viewerCounts.delete(fileId);
          }
          io.to(fileId).emit('viewerCountUpdate', { fileId, count: Math.max(0, newCount) });
          // Also notify uploader directly if registered
          const uploaderSocketId = uploaderSockets.get(fileId);
          if (uploaderSocketId) {
            io.to(uploaderSocketId).emit('viewerCountUpdate', { fileId, count: Math.max(0, newCount) });
          }
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

      // Clean up viewers on disconnect if the socket left without sending leaveFile
      const rooms = socketFileRooms.get(socket.id);
      if (rooms) {
        rooms.forEach((fileId) => {
          if (viewerCounts.has(fileId)) {
            viewerCounts.set(fileId, viewerCounts.get(fileId) - 1);
            const newCount = viewerCounts.get(fileId);
            if (newCount <= 0) {
              viewerCounts.delete(fileId);
            }
            io.to(fileId).emit('viewerCountUpdate', { fileId, count: Math.max(0, newCount) });
          }
          console.log(`[Socket] Client disconnected and left file room: ${fileId}`);
        });
        socketFileRooms.delete(socket.id);
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
  // Also notify uploader socket directly if registered so uploader UI receives live counts
  const uploaderSocketId = uploaderSockets.get(fileId);
  if (uploaderSocketId) {
    io.to(uploaderSocketId).emit('viewerCountUpdate', { fileId, count });
  }
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

    // Get files expiring within the next 60 seconds or already expired that we're tracking
    const trackedIds = Array.from(expirationTracking.keys()).map(id => `'${id}'`).join(',');
    const result = await pool.query(
      `SELECT id, expiration_timestamp FROM files
       WHERE expiration_timestamp <= NOW() + INTERVAL '60 seconds'
       AND id IN (${trackedIds})`
    );

    for (const row of result.rows) {
      const expiresAt = new Date(row.expiration_timestamp);
      const diff = expiresAt - now;
      // Include files that are about to expire within the next 60s or already expired
      if (diff <= 60000) {
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
async function deleteExpiredFile(fileId, fileName) {
  const pool = require('./db');

  try {
    await deleteStorageFile(fileName);
    console.log(`[Expiration] Deleted expired file from cloud storage: ${fileName}`);
  } catch (err) {
    console.error(`[Expiration] Failed to delete expired file from cloud storage: ${fileName}`, err.message);
  }

  try {
    await pool.query('DELETE FROM files WHERE id = $1', [fileId]);
    console.log(`[Expiration] Deleted expired file record: ${fileId}`);
  } catch (err) {
    console.error(`[Expiration] Failed to delete expired file record: ${fileId}`, err.message);
  }
}

async function emitExpirationUpdates() {
  if (!io) return;

  const filesToUpdate = await getFilesAboutToExpire();

  for (const { fileId, diff, expiresAt } of filesToUpdate) {
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    const formattedTime =
      hours > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : minutes > 0
        ? `${minutes}m ${seconds}s`
        : `${seconds}s`;

    const payload = {
      fileId,
      timeRemaining: diff,
      isExpired: diff <= 0,
      formattedTime: diff <= 0 ? 'Expired' : formattedTime,
    };

    io.to(fileId).emit('expirationUpdate', payload);
    const uploaderSocketId = uploaderSockets.get(fileId);
    if (uploaderSocketId) {
      io.to(uploaderSocketId).emit('expirationUpdate', payload);
    }

    if (diff <= 0) {
      // Immediately clean up files that have just expired rather than waiting for cron.
      const pool = require('./db');
      const result = await pool.query('SELECT file_name FROM files WHERE id = $1', [fileId]);
      if (result.rows.length > 0) {
        await deleteExpiredFile(fileId, result.rows[0].file_name);
      }
      stopExpirationTracking(fileId);
    }
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
