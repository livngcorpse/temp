const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { isValidMimeType, validateFileSize, sanitizeFilename } = require('./middleware/security');

const SALT_ROUNDS = 10;

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const { v4: uuidv4 } = require('uuid');
    const ext = path.extname(file.originalname);
    const uniqueName = uuidv4() + ext;
    cb(null, uniqueName);
  },
});

// Enhanced file filter with MIME type validation
const fileFilter = (req, file, cb) => {
  // Validate MIME type
  if (!isValidMimeType(file.mimetype)) {
    return cb(new Error('File type not allowed. Please upload a supported file type.'));
  }

  // If multer has determined the file size already, validate it.
  if (typeof file.size === 'number' && !validateFileSize(file.size)) {
    return cb(new Error('Invalid file size'));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
});

/**
 * Hash a password using bcrypt
 */
function hashPassword(password) {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

/**
 * Validate password strength
 */
function validatePasswordStrength(password) {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 4) {
    return { valid: false, error: 'Password must be at least 4 characters' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password too long. Maximum 128 characters.' };
  }

  // Check for common weak passwords
  const commonPasswords = [
    '123456',
    'password',
    '12345678',
    'qwerty',
    'abc123',
    '123456789',
    '12345',
    '1234567',
    'letmein',
    'welcome',
    'monkey',
    'dragon',
    'master',
    'admin',
    'login',
  ];
  if (commonPasswords.includes(password.toLowerCase())) {
    return { valid: false, error: 'Password too common. Please choose a stronger password.' };
  }

  return { valid: true };
}

module.exports = { upload, hashPassword, verifyPassword, validatePasswordStrength };
