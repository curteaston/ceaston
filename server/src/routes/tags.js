import { Router } from 'express';
import { pool, query } from '../db.js';
import { auditChange, auditTagCascadeDelete, createAuditBatch } from '../audit.js';
import { h, badRequest, notFound } from '../util.js';

const router = Router();

router.get('/', h(async (req, res) => {
  const { rows } = await query('SELECT * FROM tags ORDER BY name');
  res.json(rows);
}));

router.post('/', h(async (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) throw badRequest('name is required');
  const cleanName = name.trim();

  const client = await pool.connect();
  let tag;
  let auditBatchId = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tags (name, color) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING *`,
      [cleanName, color || '#6366f1']
    );
    if (rows[0]) {
      tag = rows[0];
      auditBatchId = await createAuditBatch(client, {
        action: 'tag.create',
        summary: `Create tag ${cleanName}`,
        req,
        metadata: { tag_id: tag.id },
      });
      await auditChange(client, auditBatchId, {
        table: 'tags',
        operation: 'insert',
        before: null,
        after: tag,
        metadata: { route: 'tag.create' },
      });
    } else {
      const existing = await client.query('SELECT * FROM tags WHERE name = $1', [cleanName]);
      tag = existing.rows[0];
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ...tag, audit_batch_id: auditBatchId });
}));

router.delete('/:id', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: tagRows } = await client.query('SELECT * FROM tags WHERE id = $1', [req.params.id]);
    if (!tagRows[0]) throw notFound('Tag not found');
    const auditBatchId = await createAuditBatch(client, {
      action: 'tag.delete',
      summary: `Delete tag ${tagRows[0].name}`,
      req,
      metadata: { tag_id: req.params.id },
    });
    await auditTagCascadeDelete(client, auditBatchId, [req.params.id], { route: 'tag.delete' });
    const { rowCount } = await client.query('DELETE FROM tags WHERE id = $1', [req.params.id]);
    if (!rowCount) throw notFound('Tag not found');
    await client.query('COMMIT');
    res.json({ deleted: 1, audit_batch_id: auditBatchId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get('/company/:companyId', h(async (req, res) => {
  const { rows } = await query(
    'SELECT t.* FROM tags t JOIN company_tags ct ON ct.tag_id = t.id WHERE ct.company_id = $1 ORDER BY t.name',
    [req.params.companyId]
  );
  res.json(rows);
}));

router.post('/company/:companyId', h(async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) throw badRequest('tag_id is required');

  const client = await pool.connect();
  let auditBatchId = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO company_tags (company_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
      [req.params.companyId, tag_id]
    );
    if (rows[0]) {
      auditBatchId = await createAuditBatch(client, {
        action: 'company_tag.create',
        summary: `Attach tag ${tag_id} to company ${req.params.companyId}`,
        req,
        metadata: { company_id: req.params.companyId, tag_id },
      });
      await auditChange(client, auditBatchId, {
        table: 'company_tags',
        operation: 'insert',
        before: null,
        after: rows[0],
        metadata: { route: 'company_tag.create' },
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ok: true, audit_batch_id: auditBatchId });
}));

router.delete('/company/:companyId/:tagId', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query(
      'SELECT * FROM company_tags WHERE company_id = $1 AND tag_id = $2',
      [req.params.companyId, req.params.tagId]
    );
    if (!beforeRows[0]) {
      await client.query('COMMIT');
      return res.status(204).end();
    }
    const auditBatchId = await createAuditBatch(client, {
      action: 'company_tag.delete',
      summary: `Remove tag ${req.params.tagId} from company ${req.params.companyId}`,
      req,
      metadata: { company_id: req.params.companyId, tag_id: req.params.tagId },
    });
    await auditChange(client, auditBatchId, {
      table: 'company_tags',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'company_tag.delete' },
    });
    await client.query('DELETE FROM company_tags WHERE company_id = $1 AND tag_id = $2', [req.params.companyId, req.params.tagId]);
    await client.query('COMMIT');
    res.json({ deleted: 1, audit_batch_id: auditBatchId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get('/contact/:contactId', h(async (req, res) => {
  const { rows } = await query(
    'SELECT t.* FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id WHERE ct.contact_id = $1 ORDER BY t.name',
    [req.params.contactId]
  );
  res.json(rows);
}));

router.post('/contact/:contactId', h(async (req, res) => {
  const { tag_id } = req.body;
  if (!tag_id) throw badRequest('tag_id is required');

  const client = await pool.connect();
  let auditBatchId = null;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
      [req.params.contactId, tag_id]
    );
    if (rows[0]) {
      auditBatchId = await createAuditBatch(client, {
        action: 'contact_tag.create',
        summary: `Attach tag ${tag_id} to contact ${req.params.contactId}`,
        req,
        metadata: { contact_id: req.params.contactId, tag_id },
      });
      await auditChange(client, auditBatchId, {
        table: 'contact_tags',
        operation: 'insert',
        before: null,
        after: rows[0],
        metadata: { route: 'contact_tag.create' },
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ ok: true, audit_batch_id: auditBatchId });
}));

router.delete('/contact/:contactId/:tagId', h(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: beforeRows } = await client.query(
      'SELECT * FROM contact_tags WHERE contact_id = $1 AND tag_id = $2',
      [req.params.contactId, req.params.tagId]
    );
    if (!beforeRows[0]) {
      await client.query('COMMIT');
      return res.status(204).end();
    }
    const auditBatchId = await createAuditBatch(client, {
      action: 'contact_tag.delete',
      summary: `Remove tag ${req.params.tagId} from contact ${req.params.contactId}`,
      req,
      metadata: { contact_id: req.params.contactId, tag_id: req.params.tagId },
    });
    await auditChange(client, auditBatchId, {
      table: 'contact_tags',
      operation: 'delete',
      before: beforeRows[0],
      after: null,
      metadata: { route: 'contact_tag.delete' },
    });
    await client.query('DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2', [req.params.contactId, req.params.tagId]);
    await client.query('COMMIT');
    res.json({ deleted: 1, audit_batch_id: auditBatchId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
