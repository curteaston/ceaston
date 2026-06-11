const Database = require('better-sqlite3');
const session  = require('express-session');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'dialer.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    twilio_account_sid   TEXT,
    twilio_auth_token    TEXT,
    twilio_phone_number  TEXT,
    twilio_api_key       TEXT,
    twilio_api_secret    TEXT,
    twilio_twiml_app_sid TEXT,
    ghl_api_key          TEXT,
    ghl_location_id      TEXT,
    ghl_user_id          TEXT,
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'admin',
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calls (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    user_id       TEXT NOT NULL REFERENCES users(id),
    contact_id    TEXT,
    contact_name  TEXT,
    phone         TEXT,
    duration_secs INTEGER DEFAULT 0,
    outcome       TEXT,
    notes         TEXT,
    ghl_logged    INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid    TEXT PRIMARY KEY,
    sess   TEXT NOT NULL,
    expire TEXT NOT NULL
  );
`);

// Lightweight SQLite-backed session store — swap for Redis in production
class SQLiteStore extends session.Store {
  constructor() {
    super();
    // Clean up expired sessions every 15 minutes
    setInterval(() => {
      db.prepare("DELETE FROM sessions WHERE expire < datetime('now')").run();
    }, 15 * 60 * 1000).unref();
  }

  get(sid, cb) {
    const row = db.prepare("SELECT sess, expire FROM sessions WHERE sid = ? AND expire > datetime('now')").get(sid);
    cb(null, row ? JSON.parse(row.sess) : null);
  }

  set(sid, sess, cb) {
    const ttl    = sess.cookie?.maxAge || 86400;
    const expire = new Date(Date.now() + ttl * 1000).toISOString();
    db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), expire);
    cb(null);
  }

  destroy(sid, cb) {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    cb(null);
  }
}

module.exports = { db, SQLiteStore };
