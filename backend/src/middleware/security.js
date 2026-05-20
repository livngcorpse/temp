const { escape } = require('validator');

/**
 * Sanitize user input to prevent XSS attacks
 */
function sanitizeInput(req, res, next) {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = escape(req.body[key]);
      }
    }
  }
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = escape(req.query[key]);
      }
    }
  }
  next();
}

/**
 * Validate MIME type against allowlist
 */
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/xml',
  'text/javascript',
  'text/css',
  'application/json',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
];

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

function isValidMimeType(mimeType) {
  if (!mimeType) return false;
  // Allow text/* but block dangerous subtypes
  if (mimeType.startsWith('text/')) {
    return !mimeType.includes('javascript'); // Block text/javascript for safety
  }
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Validate file size limit
 */
function validateFileSize(size) {
  return size > 0 && size <= MAX_FILE_SIZE;
}

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename) {
  // Remove directory traversal sequences
  let sanitized = filename.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  // Remove any null bytes
  sanitized = sanitized.replace(/\0/g, '');
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.trim();
  // Replace dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');
  // Limit length
  if (sanitized.length > 255) {
    const ext = filename.split('.').pop();
    const name = sanitized.substring(0, 255 - ext.length - 1);
    sanitized = name + '.' + ext;
  }
  return sanitized;
}

/**
 * Rate limiter configuration helper
 */
function createRateLimiter(options = {}) {
  const rateLimit = require('express-rate-limit');
  return rateLimit({
    windowMs: (options.windowMs || 15) * 60 * 1000,
    max: options.max || 100,
    message: {
      error: 'Too many requests',
      retryAfter: (options.windowMs || 15) * 60,
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
  });
}

/**
 * Security headers middleware (enhanced)
 */
function setSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
}

/**
 * Request logging middleware
 */
function logRequest(req, res, next) {
  const startTime = Date.now();
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  const method = req.method;
  const url = req.url;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    console.log(`[Request] ${method} ${url} ${status} ${duration}ms - ${ip} - ${userAgent}`);
  });

  next();
}

/**
 * Validate upload request body
 */
function validateUploadBody(req, res, next) {
  const { expirationMinutes, password } = req.body;

  // Validate expirationMinutes if provided
  if (expirationMinutes !== undefined) {
    const minutes = parseInt(expirationMinutes, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 43200) {
      return res.status(400).json({ error: 'Invalid expiration time. Must be between 1 and 43200 minutes.' });
    }
  }

  // Validate password if provided
  if (password !== undefined && password !== '') {
    if (typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid password format.' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password too long. Maximum 128 characters.' });
    }
  }

  next();
}

/**
 * Validate file metadata middleware
 */
function validateFileMetadata(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  for (const file of files) {
    if (!isValidMimeType(file.mimetype)) {
      return res.status(400).json({ error: 'File type not allowed. Please upload a supported file type.' });
    }

    if (!validateFileSize(file.size)) {
      return res.status(400).json({ error: 'File size exceeds limit. Maximum 500MB.' });
    }

    file.originalname = sanitizeFilename(file.originalname);
    if (!file.originalname || file.originalname.length === 0) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }
  }

  next();
}

/**
 * Validate password for protected files
 */
function validatePassword(req, res, next) {
  const { password } = req.body;

  if (!password || password.length === 0) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }

  if (password.length > 128) {
    return res.status(400).json({ error: 'Password too long. Maximum 128 characters.' });
  }

  // Check for common weak passwords
  const commonPasswords = ['123456', 'password', '12345678', 'qwerty', 'abc123', '123456789', '12345', '1234567'];
  if (commonPasswords.includes(password.toLowerCase())) {
    return res.status(400).json({ error: 'Password too common. Please choose a stronger password.' });
  }

  next();
}

module.exports = {
  sanitizeInput,
  isValidMimeType,
  validateFileSize,
  sanitizeFilename,
  createRateLimiter,
  setSecurityHeaders,
  logRequest,
  validateUploadBody,
  validateFileMetadata,
  validatePassword,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};
