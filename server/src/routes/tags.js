import { Router } from 'express';
import { query } from '../db.js';
import { h, badRequest, notFound } from '../util.js';

const router = Router();

// GET /api/tags — list all tags
router.get('/', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM tags ORDER BY name');
  res.json(rows);
}));

// POST /api/tags — create tag
router.post('/', h(async (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) throw badRequest('name is required');
  const { rows } = await query(
    `INSERT INTO tags (name, color) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
    [name.trim(), color || '#6366f1']
  );
  res.status(201).json(rows[0]);
}));

// DELETE /api/tags/:id — delete tag
router.delete('/:id', h(async (req, res) => {
  const { rowCount } = await query('DELETE FROM tags WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Tag not found');
  res.status(204).end();
}));

// GET /api/tags/company/:companyId — get tags for a company
router.get('/company/:companyId', h(async (req, res) => {
  const { rows } = await query(
    'SELECT t.* FROM tags t JOIN company_tags ct ON ct.tag_id = t.id WHERE ct.company_id = $1 ORDER BY t.name',
    [req.params.companyId]
  );
  res.json(rows);
}));

// POST /api/tags/company/:companyId — add tag to company
router.post('/company/:companyId', h(async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) throw badRequest('tag_id is required');
  await query(
    'INSERT INTO company_tags (company_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.companyId, tag_id]
  );
  res.status(201).json({ ok: true });
}));

// DELETE /api/tags/company/:companyId/:tagId — remove tag from company
router.delete('/company/:companyId/:tagId', h(async (req, res) => {
  await query('DELETE FROM company_tags WHERE company_id = $1 AND tag_id = $2', [req.params.companyId, req.params.tagId]);
  res.status(204).end();
}));

// GET /api/tags/contact/:contactId — get tags for a contact
router.get('/contact/:contactId', h(async (req, res) => {
  const { rows } = await query(
    'SELECT t.* FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id WHERE ct.contact_id = $1 ORDER BY t.name',
    [req.params.contactId]
  );
  res.json(rows);
}));

// POST /api/tags/contact/:contactId — add tag to contact
router.post('/contact/:contactId', h(async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) throw badRequest('tag_id is required');
  await query(
    'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.contactId, tag_id]
  );
  res.status(201).json({ ok: true });
}));

// DELETE /api/tags/contact/:contactId/:tagId — remove tag from contact
router.delete('/contact/:contactId/:tagId', h(async (req, res) => {
  await query('DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2', [req.params.contactId, req.params.tagId]);
  res.status(204).end();
}));

export default router;
