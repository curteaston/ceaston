const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { z }   = require('zod');
const { db }  = require('../db');

const registerSchema = z.object({
  tenantName: z.string().min(2).max(100),
  email:      z.string().email(),
  password:   z.string().min(8).max(128)
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1)
});

// POST /api/auth/register — create tenant + first admin user
router.post('/register', async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.errors[0].message });
  }

  const { tenantName, email, password } = result.data;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const tenantId     = uuid();
  const userId       = uuid();
  const passwordHash = await bcrypt.hash(password, 12);

  db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run(tenantId, tenantName);
  db.prepare('INSERT INTO users (id, tenant_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(
    userId, tenantId, email.toLowerCase(), passwordHash, 'admin'
  );

  req.session.userId   = userId;
  req.session.tenantId = tenantId;
  req.session.role     = 'admin';
  req.session.email    = email.toLowerCase();

  res.json({ ok: true, redirectTo: '/setup.html' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid email or password format' });
  }

  const { email, password } = result.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.userId   = user.id;
  req.session.tenantId = user.tenant_id;
  req.session.role     = user.role;
  req.session.email    = user.email;

  res.json({ ok: true, redirectTo: '/dialer.html' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

  const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(req.session.tenantId);

  res.json({
    user: { id: req.session.userId, email: req.session.email, role: req.session.role },
    tenant
  });
});

module.exports = router;
