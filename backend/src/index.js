require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const http = require('http');
const pool = require('./db');
const fileRoutes = require('./routes');
const path = require('path');
const { initializeCronJob } = require('./cron/cleanup');
const { initializeSocket, initializeExpirationCheck } = require('./sockets');

const app = express();
const port = normalizePort(process.env.PORT || '4000');

function normalizePort(val) {
  const portNumber = parseInt(val, 10);
  if (Number.isNaN(portNumber)) {
    return val;
  }
  return portNumber;
}

// Create HTTP server
const server = http.createServer(app);

// Security middleware (Phase 11)
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security middleware helpers
const { sanitizeInput, setSecurityHeaders, logRequest } = require('./middleware/security');

// Helmet - secure Express apps by setting HTTP headers
app.use(helmet());

// Basic rate limiting for all API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Stricter limit for upload endpoint (10 uploads per hour per IP)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 uploads per windowMs
  message: { error: 'Upload limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/api/upload', uploadLimiter);

// Stricter limit for download endpoint (20 downloads per hour per IP)
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 downloads per windowMs
  message: { error: 'Download limit exceeded. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.get('/api/download/*', downloadLimiter);

// Stricter limit for file info endpoint (50 requests per hour per IP)
const fileInfoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: { error: 'Too many file info requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.get('/api/file/*', fileInfoLimiter);

// Password verification rate limiter (5 attempts per 15 minutes per IP)
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per windowMs
  message: { error: 'Too many password attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/api/download/*/verify-password', passwordLimiter);

app.use(cors());
app.use(express.json());

// Sanitize incoming inputs and set additional security headers
app.use(sanitizeInput);
app.use(setSecurityHeaders);

// Request logging (supplemental to morgan)
app.use(logRequest);

app.use(morgan('dev'));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/testdb', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ now: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// File routes
app.use('/api', fileRoutes);

// Initialize cleanup cron job (runs every 5 minutes)
initializeCronJob(5);

// Initialize Socket.IO
const io = initializeSocket(server);

// Initialize expiration tracking (checks every 10 seconds)
initializeExpirationCheck();

(async function start() {
  try {
    await pool.query('SELECT 1');

    const onError = (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;
      switch (error.code) {
        case 'EACCES':
          console.error(`${bind} requires elevated privileges.`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(`${bind} is already in use. Please stop the process using it or set a different PORT.`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    };

    const onListening = () => {
      console.log(`Backend listening on http://localhost:${port}`);
      console.log('[Cron] Cleanup job running every 5 minutes');
      console.log('[Socket] Socket.IO initialized');
      console.log('[Security] Rate limiting enabled: API (100/15min), Upload (10/hour), Download (20/hour), File Info (50/hour), Password (5/15min)');
    };

    server.on('error', onError);
    server.on('listening', onListening);

    server.listen(port);
  } catch (error) {
    console.error('Unable to connect to PostgreSQL:', error.message);
    process.exit(1);
  }
})();

app.get('/', (req, res) => {
    res.json({
        status: "success",
        message: "Quickdrop Core Backend is alive and connected via the tunnel!"
    });
});
