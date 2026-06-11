const { db } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Attach tenant row to req.tenant for all authenticated requests
function loadTenant(req, res, next) {
  if (!req.session?.tenantId) return next();
  req.tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.session.tenantId) || null;
  next();
}

module.exports = { requireAuth, requireAdmin, loadTenant };
