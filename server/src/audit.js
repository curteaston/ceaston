import crypto from 'crypto';
import { badRequest, notFound } from './util.js';

const TABLES = {
  companies: { pk: ['id'], serial: true },
  contacts: { pk: ['id'], serial: true },
  deals: { pk: ['id'], serial: true },
  tasks: { pk: ['id'], serial: true },
  notes: { pk: ['id'], serial: true },
  activities: { pk: ['id'], serial: true },
  sequences: { pk: ['id'], serial: true },
  sequence_steps: { pk: ['id'], serial: true },
  sequence_enrollments: { pk: ['id'], serial: true },
  sequence_step_runs: { pk: ['id'], serial: true },
  tags: { pk: ['id'], serial: true },
  company_tags: { pk: ['company_id', 'tag_id'], serial: false },
  contact_tags: { pk: ['contact_id', 'tag_id'], serial: false },
  saved_views: { pk: ['id'], serial: true },
  email_templates: { pk: ['id'], serial: true },
};

const INSERT_PRIORITY = {
  companies: 10,
  sequences: 10,
  tags: 10,
  contacts: 20,
  deals: 30,
  tasks: 30,
  notes: 30,
  activities: 30,
  sequence_steps: 30,
  sequence_enrollments: 40,
  sequence_step_runs: 50,
  company_tags: 60,
  contact_tags: 60,
  saved_views: 70,
  email_templates: 70,
};

const DELETE_PRIORITY = {
  sequence_step_runs: 10,
  company_tags: 10,
  contact_tags: 10,
  tasks: 20,
  notes: 20,
  activities: 20,
  deals: 20,
  sequence_steps: 20,
  sequence_enrollments: 30,
  contacts: 40,
  companies: 50,
  sequences: 50,
  tags: 50,
  saved_views: 60,
  email_templates: 60,
};

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameRow(left, right) {
  return stableStringify(normalizeJson(left)) === stableStringify(normalizeJson(right));
}

function tableConfig(table) {
  const config = TABLES[table];
  if (!config) throw new Error(`Audit does not support table ${table}`);
  return config;
}

function pkForRow(table, row) {
  const { pk } = tableConfig(table);
  return Object.fromEntries(pk.map((column) => [column, row[column]]));
}

function whereForPk(table, pk, startIndex = 1) {
  const columns = tableConfig(table).pk;
  const values = [];
  const clauses = columns.map((column, index) => {
    if (!Object.prototype.hasOwnProperty.call(pk, column)) {
      throw new Error(`Missing primary-key column ${column} for ${table}`);
    }
    values.push(pk[column]);
    return `${quoteIdentifier(column)} = $${startIndex + index}`;
  });
  return { clause: clauses.join(' AND '), values };
}

function actorFromReq(req) {
  return req?.get?.('x-crm-actor')
    || req?.get?.('x-api-key') && 'api-key'
    || req?.get?.('authorization') && 'api-key'
    || 'browser';
}

export async function createAuditBatch(client, {
  action,
  summary = null,
  req = null,
  metadata = {},
  undoable = true,
  id = crypto.randomUUID(),
}) {
  await client.query(
    `INSERT INTO data_audit_batches
       (id, action, summary, actor, request_method, request_path, metadata, undoable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      action,
      summary,
      actorFromReq(req),
      req?.method || null,
      req?.originalUrl || req?.url || null,
      metadata,
      undoable,
    ],
  );
  return id;
}

export async function auditChange(client, batchId, {
  table,
  operation,
  before = null,
  after = null,
  metadata = {},
}) {
  if (!['insert', 'update', 'delete'].includes(operation)) throw new Error(`Invalid audit operation ${operation}`);
  const rowForPk = after || before;
  if (!rowForPk) throw new Error('Audit change requires before or after row data');
  await client.query(
    `INSERT INTO data_audit_events
       (batch_id, operation, table_name, record_pk, before_data, after_data, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      batchId,
      operation,
      table,
      pkForRow(table, rowForPk),
      before ? normalizeJson(before) : null,
      after ? normalizeJson(after) : null,
      metadata,
    ],
  );
}

export async function auditRows(client, batchId, table, operation, rows, metadata = {}) {
  for (const row of rows) {
    await auditChange(client, batchId, {
      table,
      operation,
      before: operation === 'insert' ? null : row,
      after: operation === 'delete' ? null : row,
      metadata,
    });
  }
}

function rowKey(table, row) {
  return stableStringify(pkForRow(table, row));
}

export async function auditRowDiff(client, batchId, table, beforeRows, afterRows, metadata = {}) {
  const beforeByKey = new Map(beforeRows.map((row) => [rowKey(table, row), row]));
  const afterByKey = new Map(afterRows.map((row) => [rowKey(table, row), row]));

  for (const [key, before] of beforeByKey.entries()) {
    const after = afterByKey.get(key);
    if (!after) {
      await auditChange(client, batchId, { table, operation: 'delete', before, after: null, metadata });
    } else if (!sameRow(before, after)) {
      await auditChange(client, batchId, { table, operation: 'update', before, after, metadata });
    }
  }

  for (const [key, after] of afterByKey.entries()) {
    if (!beforeByKey.has(key)) {
      await auditChange(client, batchId, { table, operation: 'insert', before: null, after, metadata });
    }
  }
}

export async function fetchRows(client, sql, values = []) {
  const { rows } = await client.query(sql, values);
  return rows;
}

export async function auditCompanyCascadeDelete(client, batchId, companyIds, metadata = {}) {
  const ids = companyIds.map(Number).filter(Number.isFinite);
  if (!ids.length) return 0;

  const contacts = await fetchRows(client, 'SELECT * FROM contacts WHERE company_id = ANY($1::int[]) ORDER BY id', [ids]);
  const contactIds = contacts.map((row) => row.id);
  const enrollments = await fetchRows(client, 'SELECT * FROM sequence_enrollments WHERE company_id = ANY($1::int[]) ORDER BY id', [ids]);
  const enrollmentIds = enrollments.map((row) => row.id);

  const tableRows = [
    ['contact_tags', contactIds.length ? await fetchRows(client, 'SELECT * FROM contact_tags WHERE contact_id = ANY($1::int[]) ORDER BY contact_id, tag_id', [contactIds]) : []],
    ['company_tags', await fetchRows(client, 'SELECT * FROM company_tags WHERE company_id = ANY($1::int[]) ORDER BY company_id, tag_id', [ids])],
    ['sequence_step_runs', enrollmentIds.length ? await fetchRows(client, 'SELECT * FROM sequence_step_runs WHERE enrollment_id = ANY($1::int[]) ORDER BY id', [enrollmentIds]) : []],
    ['sequence_enrollments', enrollments],
    ['tasks', await fetchRows(client, 'SELECT * FROM tasks WHERE company_id = ANY($1::int[]) OR contact_id = ANY($2::int[]) ORDER BY id', [ids, contactIds])],
    ['notes', await fetchRows(client, 'SELECT * FROM notes WHERE company_id = ANY($1::int[]) ORDER BY id', [ids])],
    ['activities', await fetchRows(client, 'SELECT * FROM activities WHERE company_id = ANY($1::int[]) ORDER BY id', [ids])],
    ['deals', await fetchRows(client, 'SELECT * FROM deals WHERE company_id = ANY($1::int[]) ORDER BY id', [ids])],
    ['contacts', contacts],
    ['companies', await fetchRows(client, 'SELECT * FROM companies WHERE id = ANY($1::int[]) ORDER BY id', [ids])],
  ];

  let audited = 0;
  for (const [table, rows] of tableRows) {
    await auditRows(client, batchId, table, 'delete', rows, metadata);
    audited += rows.length;
  }
  return audited;
}

export async function auditContactCascadeDelete(client, batchId, contactIds, metadata = {}) {
  const ids = contactIds.map(Number).filter(Number.isFinite);
  if (!ids.length) return { deletedRows: 0, enrollmentBeforeRows: [] };

  const tableRows = [
    ['contact_tags', await fetchRows(client, 'SELECT * FROM contact_tags WHERE contact_id = ANY($1::int[]) ORDER BY contact_id, tag_id', [ids])],
    ['tasks', await fetchRows(client, 'SELECT * FROM tasks WHERE contact_id = ANY($1::int[]) ORDER BY id', [ids])],
    ['notes', await fetchRows(client, 'SELECT * FROM notes WHERE contact_id = ANY($1::int[]) ORDER BY id', [ids])],
    ['activities', await fetchRows(client, 'SELECT * FROM activities WHERE contact_id = ANY($1::int[]) ORDER BY id', [ids])],
    ['contacts', await fetchRows(client, 'SELECT * FROM contacts WHERE id = ANY($1::int[]) ORDER BY id', [ids])],
  ];

  let audited = 0;
  for (const [table, rows] of tableRows) {
    await auditRows(client, batchId, table, 'delete', rows, metadata);
    audited += rows.length;
  }

  const enrollmentBeforeRows = await fetchRows(
    client,
    'SELECT * FROM sequence_enrollments WHERE contact_id = ANY($1::int[]) ORDER BY id',
    [ids],
  );
  return { deletedRows: audited, enrollmentBeforeRows };
}

export async function auditSequenceCascadeDelete(client, batchId, sequenceIds, metadata = {}) {
  const ids = sequenceIds.map(Number).filter(Number.isFinite);
  if (!ids.length) return 0;

  const steps = await fetchRows(client, 'SELECT * FROM sequence_steps WHERE sequence_id = ANY($1::int[]) ORDER BY id', [ids]);
  const stepIds = steps.map((row) => row.id);
  const enrollments = await fetchRows(client, 'SELECT * FROM sequence_enrollments WHERE sequence_id = ANY($1::int[]) ORDER BY id', [ids]);
  const enrollmentIds = enrollments.map((row) => row.id);
  const runs = await fetchRows(
    client,
    `SELECT * FROM sequence_step_runs
      WHERE step_id = ANY($1::int[]) OR enrollment_id = ANY($2::int[])
      ORDER BY id`,
    [stepIds, enrollmentIds],
  );

  const tableRows = [
    ['sequence_step_runs', runs],
    ['sequence_enrollments', enrollments],
    ['sequence_steps', steps],
    ['sequences', await fetchRows(client, 'SELECT * FROM sequences WHERE id = ANY($1::int[]) ORDER BY id', [ids])],
  ];

  let audited = 0;
  for (const [table, rows] of tableRows) {
    await auditRows(client, batchId, table, 'delete', rows, metadata);
    audited += rows.length;
  }
  return audited;
}

export async function auditTagCascadeDelete(client, batchId, tagIds, metadata = {}) {
  const ids = tagIds.map(Number).filter(Number.isFinite);
  if (!ids.length) return 0;

  const tableRows = [
    ['company_tags', await fetchRows(client, 'SELECT * FROM company_tags WHERE tag_id = ANY($1::int[]) ORDER BY company_id, tag_id', [ids])],
    ['contact_tags', await fetchRows(client, 'SELECT * FROM contact_tags WHERE tag_id = ANY($1::int[]) ORDER BY contact_id, tag_id', [ids])],
    ['tags', await fetchRows(client, 'SELECT * FROM tags WHERE id = ANY($1::int[]) ORDER BY id', [ids])],
  ];

  let audited = 0;
  for (const [table, rows] of tableRows) {
    await auditRows(client, batchId, table, 'delete', rows, metadata);
    audited += rows.length;
  }
  return audited;
}

export async function auditEnrollmentContactNulling(client, batchId, beforeRows, metadata = {}) {
  if (!beforeRows.length) return 0;
  const ids = beforeRows.map((row) => row.id);
  const { rows: afterRows } = await client.query(
    'SELECT * FROM sequence_enrollments WHERE id = ANY($1::int[]) ORDER BY id',
    [ids],
  );
  const afterById = new Map(afterRows.map((row) => [row.id, row]));
  for (const before of beforeRows) {
    const after = afterById.get(before.id);
    if (after && !sameRow(before, after)) {
      await auditChange(client, batchId, {
        table: 'sequence_enrollments',
        operation: 'update',
        before,
        after,
        metadata,
      });
    }
  }
  return afterRows.length;
}

async function tableColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  if (!rows.length) throw new Error(`Table ${table} does not exist`);
  return new Set(rows.map((row) => row.column_name));
}

async function readCurrentRow(client, table, pk) {
  const { clause, values } = whereForPk(table, pk);
  const { rows } = await client.query(`SELECT * FROM ${quoteIdentifier(table)} WHERE ${clause}`, values);
  return rows[0] || null;
}

async function deleteCurrentRow(client, table, pk) {
  const { clause, values } = whereForPk(table, pk);
  await client.query(`DELETE FROM ${quoteIdentifier(table)} WHERE ${clause}`, values);
}

async function insertRow(client, table, row) {
  const columns = await tableColumns(client, table);
  const keys = Object.keys(row).filter((key) => columns.has(key));
  const values = keys.map((key) => row[key]);
  await client.query(
    `INSERT INTO ${quoteIdentifier(table)}
       (${keys.map(quoteIdentifier).join(', ')})
     VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')})`,
    values,
  );
}

async function updateRow(client, table, pk, row) {
  const columns = await tableColumns(client, table);
  const pkColumns = new Set(tableConfig(table).pk);
  const keys = Object.keys(row).filter((key) => columns.has(key) && !pkColumns.has(key));
  if (!keys.length) return;
  const values = keys.map((key) => row[key]);
  const { clause, values: pkValues } = whereForPk(table, pk, values.length + 1);
  await client.query(
    `UPDATE ${quoteIdentifier(table)}
        SET ${keys.map((key, index) => `${quoteIdentifier(key)} = $${index + 1}`).join(', ')}
      WHERE ${clause}`,
    [...values, ...pkValues],
  );
}

async function resetSerial(client, table) {
  if (!tableConfig(table).serial) return;
  const { rows: sequenceRows } = await client.query('SELECT pg_get_serial_sequence($1, $2) AS sequence_name', [table, 'id']);
  const sequenceName = sequenceRows[0]?.sequence_name;
  if (!sequenceName) return;
  const { rows } = await client.query(`SELECT max(id)::bigint AS max_id FROM ${quoteIdentifier(table)}`);
  const maxId = rows[0].max_id;
  await client.query('SELECT setval($1::regclass, $2::bigint, $3::boolean)', [
    sequenceName,
    maxId || '1',
    Boolean(maxId),
  ]);
}

function undoPriority(event) {
  const table = event.table_name;
  if (event.operation === 'delete') return INSERT_PRIORITY[table] ?? 500;
  if (event.operation === 'insert') return DELETE_PRIORITY[table] ?? 500;
  return 200 + (INSERT_PRIORITY[table] ?? 500);
}

function sortUndoEvents(events) {
  return [...events].sort((a, b) => {
    const priority = undoPriority(a) - undoPriority(b);
    if (priority) return priority;
    return b.id - a.id;
  });
}

export async function undoAuditBatch(client, batchId, { req = null } = {}) {
  const { rows: batchRows } = await client.query(
    'SELECT * FROM data_audit_batches WHERE id = $1 FOR UPDATE',
    [batchId],
  );
  const batch = batchRows[0];
  if (!batch) throw notFound('Audit batch not found');
  if (!batch.undoable) throw badRequest(`Audit batch ${batch.id} is not undoable`);
  if (batch.undone_at) throw badRequest(`Audit batch ${batch.id} was already undone`);

  const { rows: events } = await client.query(
    'SELECT * FROM data_audit_events WHERE batch_id = $1 ORDER BY id',
    [batchId],
  );
  if (!events.length) throw badRequest(`Audit batch ${batch.id} has no events to undo`);

  const undoBatchId = await createAuditBatch(client, {
    action: `undo:${batch.action}`,
    summary: `Undo ${batch.summary || batch.action}`,
    req,
    undoable: false,
    metadata: { undone_batch_id: batch.id },
  });

  let undone = 0;
  const resetTables = new Set();
  for (const event of sortUndoEvents(events)) {
    const table = event.table_name;
    const pk = event.record_pk;
    const current = await readCurrentRow(client, table, pk);

    if (event.operation === 'insert') {
      if (!current) throw badRequest(`Cannot undo ${batch.id}: ${table} ${stableStringify(pk)} no longer exists`);
      if (!sameRow(current, event.after_data)) {
        throw badRequest(`Cannot undo ${batch.id}: ${table} ${stableStringify(pk)} changed after the audited operation`);
      }
      await deleteCurrentRow(client, table, pk);
      await auditChange(client, undoBatchId, { table, operation: 'delete', before: current, after: null, metadata: { undo_of_event_id: event.id } });
    } else if (event.operation === 'delete') {
      if (current) throw badRequest(`Cannot undo ${batch.id}: ${table} ${stableStringify(pk)} already exists`);
      await insertRow(client, table, event.before_data);
      resetTables.add(table);
      await auditChange(client, undoBatchId, { table, operation: 'insert', before: null, after: event.before_data, metadata: { undo_of_event_id: event.id } });
    } else if (event.operation === 'update') {
      if (!current) throw badRequest(`Cannot undo ${batch.id}: ${table} ${stableStringify(pk)} no longer exists`);
      if (!sameRow(current, event.after_data)) {
        throw badRequest(`Cannot undo ${batch.id}: ${table} ${stableStringify(pk)} changed after the audited operation`);
      }
      await updateRow(client, table, pk, event.before_data);
      await auditChange(client, undoBatchId, { table, operation: 'update', before: current, after: event.before_data, metadata: { undo_of_event_id: event.id } });
    }

    await client.query(
      'UPDATE data_audit_events SET undone_at = now(), undo_batch_id = $2 WHERE id = $1',
      [event.id, undoBatchId],
    );
    undone++;
  }

  for (const table of resetTables) await resetSerial(client, table);
  await client.query(
    'UPDATE data_audit_batches SET undone_at = now(), undo_batch_id = $2, undo_error = NULL WHERE id = $1',
    [batch.id, undoBatchId],
  );
  return { batch_id: batch.id, undo_batch_id: undoBatchId, events_undone: undone };
}
