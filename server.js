require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const morgan      = require('morgan');
const session     = require('express-session');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const { SQLiteStore } = require('./db');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'sdk.twilio.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'fonts.googleapis.com'],
      fontSrc:     ["'self'", 'fonts.gstatic.com', 'cdn.jsdelivr.net'],
      connectSrc:  ["'self'", '*.twilio.com', 'wss://*.twilio.com', 'services.leadconnectorhq.com'],
      mediaSrc:    ["'self'", '*.twilio.com'],
      imgSrc:      ["'self'", 'data:']
    }
  }
}));

// ── CORS — restrict to own origin in production ────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── HTTPS redirect in production ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ── Request parsing & logging ─────────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));
app.use(morgan('combined'));

// ── Session ───────────────────────────────────────────────────────────────────
app.use(session({
  store:             new SQLiteStore(),
  secret:            process.env.SESSION_SECRET || (() => { throw new Error('SESSION_SECRET is required'); })(),
  resave:            false,
  saveUninitialized: false,
  name:              'pd.sid',
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   24 * 60 * 60 * 1000  // 24 hours
  }
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 60_000, max: 10,  message: { error: 'Too many attempts. Try again in a minute.' } });
const tokenLimiter = rateLimit({ windowMs: 60_000, max: 15 });

app.use('/api/', apiLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/token',         tokenLimiter);

// ── Static files (serve HTML/CSS/JS) ─────────────────────────────────────────
app.use(express.static(path.join(__dirname), {
  // Don't cache HTML in production so auth checks always run fresh
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/calls',    require('./routes/calls'));
app.use('/api/token',    require('./routes/token'));
app.use('/api/voice',    require('./routes/voice'));
app.use('/api/setup',    require('./routes/setup'));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => console.error('[UnhandledRejection]', reason));
process.on('uncaughtException',  (err)    => { console.error('[UncaughtException]', err); process.exit(1); });

const PORT = parseInt(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
  console.log(`Power Dialer → http://localhost:${PORT}/login.html`);
});

// Graceful shutdown — drain connections before exit
function shutdown() {
  server.close(() => { console.log('Server shut down gracefully.'); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
