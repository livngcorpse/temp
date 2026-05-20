const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { upload, hashPassword, verifyPassword, validatePasswordStrength } = require('./multer');
const pool = require('./db');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const {
  emitUploadProgress,
  emitFileUploaded,
  emitDownloadNotification,
  startExpirationTracking,
  emitViewerCountUpdate,
} = require('./sockets');
const {
  isValidMimeType,
  validateFileSize,
  sanitizeFilename,
  validateUploadBody,
  validateFileMetadata,
} = require('./middleware/security');

// Sanitize all input by default
router.use((req, res, next) => {
  const { escape } = require('validator');
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = escape(req.body[key]);
      }
    }
  }
  next();
});

// POST /api/upload
router.post('/upload', validateUploadBody, upload.array('files', 10), validateFileMetadata, async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { expirationMinutes = 60, password } = req.body;

    // Validate expiration time
    const minutes = parseInt(expirationMinutes, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 43200) {
      return res.status(400).json({ error: 'Invalid expiration time. Must be between 1 and 43200 minutes.' });
    }

    // Validate password if provided
    if (password && password.trim()) {
      const validation = validatePasswordStrength(password.trim());
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
    }

    const expirationTime = new Date(Date.now() + minutes * 60 * 1000);
    const uploaderIp = req.ip || req.connection.remoteAddress;

    let passwordHash = null;
    if (password && password.trim()) {
      passwordHash = hashPassword(password.trim());
    }

    const uploadedFiles = [];

    for (const file of files) {
      const fileId = uuidv4();
      await pool.query(
        `INSERT INTO files (id, original_name, file_name, file_size, mime_type, expiration_timestamp, uploader_ip, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          fileId,
          file.originalname,
          file.filename,
          file.size,
          file.mimetype,
          expirationTime,
          uploaderIp,
          passwordHash,
        ]
      );

      const fileData = {
        fileId,
        fileName: file.originalname,
        fileSize: file.size,
        shareLink: `/f/${fileId}`,
        expiresAt: expirationTime,
        passwordProtected: !!passwordHash,
      };

      emitUploadProgress(fileId, 100);
      emitFileUploaded(fileId, fileData);
      startExpirationTracking(fileId, expirationTime);

      uploadedFiles.push(fileData);
    }

    res.json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/file/:id (metadata only for now)
router.get('/file/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid file ID format' });
    }

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(file.expiration_timestamp);
    const isExpired = now > expiresAt;
    const remainingMs = expiresAt - now;

    res.json({
      id: file.id,
      originalName: file.original_name,
      fileSize: file.file_size,
      mimeType: file.mime_type,
      uploadTimestamp: file.upload_timestamp,
      expirationTimestamp: file.expiration_timestamp,
      downloadCount: file.download_count,
      passwordProtected: !!file.password_hash,
      isExpired,
      timeRemaining: isExpired ? 0 : remainingMs,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Fetch file error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/file/:id/check-expiration (check expiration status without file metadata)
router.get('/file/:id/check-expiration', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid file ID format' });
    }

    const result = await pool.query('SELECT expiration_timestamp FROM files WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found', fileExists: false });
    }

    const file = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(file.expiration_timestamp);
    const isExpired = now > expiresAt;
    const remainingMs = isExpired ? 0 : expiresAt - now;

    res.json({
      fileExists: true,
      isExpired,
      expiresAt: expiresAt.toISOString(),
      timeRemaining: remainingMs,
    });
  } catch (error) {
    console.error('Expiration check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rate limiter for password verification (max 5 attempts per 15 minutes per IP)
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per windowMs
  message: { error: 'Too many password attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/download/:id/verify-password (verify password for protected files)
router.post('/download/:id/verify-password', passwordLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid file ID format' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // Check if file has password protection
    if (!file.password_hash) {
      return res.status(400).json({ error: 'File is not password protected' });
    }

    // Verify password using bcrypt
    const isPasswordValid = verifyPassword(password, file.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/download/:id (download file with streaming)
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid file ID format' });
    }

    const result = await pool.query('SELECT * FROM files WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // Check if expired
    if (new Date() > new Date(file.expiration_timestamp)) {
      return res.status(410).json({ error: 'File has expired' });
    }

    // Increment download count
    await pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [id]);

    // Get updated file data after incrementing
    const updatedResult = await pool.query('SELECT * FROM files WHERE id = $1', [id]);
    const updatedFile = updatedResult.rows[0];

    // Emit download notification to uploader
    emitDownloadNotification(id, {
      fileName: updatedFile.original_name,
      downloadCount: updatedFile.download_count,
      timestamp: new Date().toISOString(),
    });

    const filePath = path.join(__dirname, '../uploads', file.file_name);

    // Check if file exists on disk
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Set headers for download
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(file.original_name)}"`);
    res.setHeader('Content-Length', file.file_size);

    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Multer and upload middleware error handler
router.use((err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  const clientErrors = [
    'File type not allowed. Please upload a supported file type.',
    'File size exceeds 500MB limit',
    'Invalid file size',
  ];

  if (clientErrors.includes(err.message)) {
    return res.status(400).json({ error: err.message });
  }

  console.error('Unhandled router error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = router;
