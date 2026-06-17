import { readFile } from 'fs/promises';
import { isAbsolute, resolve } from 'path';

const LOCAL_DATABASE_URL = `postgres://${process.env.LOCAL_CRM_DBUSER || 'crm'}@127.0.0.1:${process.env.LOCAL_CRM_PGPORT || '55432'}/${process.env.LOCAL_CRM_DB || 'hvac_crm'}`;

const RESTORE_TABLES = [
  'companies',
  'contacts',
  'deals',
  'tasks',
  'notes',
  'activities',
  'sequences',
  'sequence_steps',
  'sequence_enrollments',
  'sequence_step_runs',
  'tags',
  'company_tags',
  'contact_tags',
  'saved_views',
  'email_templates',
  'webhooks',
  'data_audit_batches',
  'data_audit_events',
];

const RESTORE_ORDER = [
  'companies',
  'contacts',
  'deals',
  'tasks',
  'notes',
  'activities',
  'sequences',
  'sequence_steps',
  'sequence_enrollments',
  'sequence_step_runs',
  'tags',
  'company_tags',
  'contact_tags',
  'saved_views',
  'email_templates',
  'webhooks',
  'data_audit_batches',
  'data_audit_events',
];

const SERIAL_TABLES = RESTORE_TABLES.filter((table) => !['company_tags', 'contact_tags'].includes(table));
const IGNORED_FIELDS = {
  webhooks: new Set(['has_secret']),
};

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  console.error(usage());
  process.exit(1);
}
if (args.help) {
  console.log(usage());
  process.exit(0);
}
if (!args.file) {
  console.error('Missing snapshot file.');
  console.error(usage());
  process.exit(1);
}

process.env.DATABASE_URL = args.databaseUrl || process.env.DATABASE_URL || LOCAL_DATABASE_URL;

const { initDb, pool } = await import('../server/src/db.js');

function usage() {
  return [
    'Usage: node scripts/restore-snapshot.mjs --file snapshot.json [--database-url postgres://...] [--force]',
    '',
    'Restores prospecting records from a JSON snapshot.',
    'Refuses to replace a non-empty target database unless --force is passed.',
    'app_settings are not restored; webhook secrets are intentionally not restored.',
  ].join('\n');
}

function parseArgs(rawArgs) {
  const parsed = {
    file: null,
    databaseUrl: null,
    force: false,
    help: false,
  };
  const positional = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--file') {
      parsed.file = requireValue(rawArgs, index, arg);
      index += 1;
    } else if (arg === '--database-url') {
      parsed.databaseUrl = requireValue(rawArgs, index, arg);
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (!parsed.file && positional.length) parsed.file = positional[0];
  if (positional.length > 1) throw new Error(`Unexpected extra argument: ${positional.slice(1).join(' ')}`);
  if (parsed.file) parsed.file = isAbsolute(parsed.file) ? parsed.file : resolve(process.cwd(), parsed.file);
  return parsed;
}

function requireValue(rawArgs, index, option) {
  const value = rawArgs[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return value;
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Snapshot must be a JSON object.');
  if (snapshot.kind !== 'prospecting-data-snapshot') throw new Error(`Unexpected snapshot kind: ${snapshot.kind || 'missing'}`);
  if (snapshot.schema_version !== 'prospecting-v1') throw new Error(`Unsupported schema version: ${snapshot.schema_version || 'missing'}`);
  if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) throw new Error('Snapshot is missing data.');
  if (!snapshot.counts || typeof snapshot.counts !== 'object' || Array.isArray(snapshot.counts)) throw new Error('Snapshot is missing counts.');

  for (const table of RESTORE_TABLES) {
    if (!Array.isArray(snapshot.data[table])) throw new Error(`Snapshot is missing table data.${table}.`);
    if (snapshot.counts[table] !== snapshot.data[table].length) {
      throw new Error(`Snapshot count mismatch for ${table}: counts says ${snapshot.counts[table]}, data has ${snapshot.data[table].length}.`);
    }
  }
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
  if (!rows.length) throw new Error(`Database table ${table} does not exist after schema initialization.`);
  return new Set(rows.map((row) => row.column_name));
}

async function tableCounts(client, tables) {
  const counts = {};
  for (const table of tables) {
    const { rows } = await client.query(`SELECT count(*)::int AS count FROM ${quoteIdentifier(table)}`);
    counts[table] = rows[0].count;
  }
  return counts;
}

async function insertRows(client, table, rows, columns) {
  const ignored = IGNORED_FIELDS[table] || new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Snapshot table ${table} contains a non-object row.`);
    }

    const keys = Object.keys(row);
    const unknown = keys.filter((key) => !columns.has(key) && !ignored.has(key));
    if (unknown.length) {
      throw new Error(`Snapshot table ${table} contains unknown column(s): ${unknown.join(', ')}.`);
    }

    const insertColumns = keys.filter((key) => columns.has(key) && !ignored.has(key));
    if (!insertColumns.length) continue;

    const sql = [
      `INSERT INTO ${quoteIdentifier(table)}`,
      `(${insertColumns.map(quoteIdentifier).join(', ')})`,
      `VALUES (${insertColumns.map((_, index) => `$${index + 1}`).join(', ')})`,
    ].join(' ');
    await client.query(sql, insertColumns.map((key) => row[key]));
  }
}

async function resetSerial(client, table) {
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

async function restoreSnapshot(snapshot) {
  await initDb();
  const client = await pool.connect();
  try {
    const existingCounts = await tableCounts(client, RESTORE_TABLES);
    const nonEmpty = Object.entries(existingCounts).filter(([, count]) => count > 0);
    if (nonEmpty.length && !args.force) {
      throw new Error(
        `Target database is not empty (${nonEmpty.map(([table, count]) => `${table}=${count}`).join(', ')}). ` +
        'Re-run with --force only after confirming this is the intended restore target.',
      );
    }

    const columnsByTable = {};
    for (const table of RESTORE_TABLES) columnsByTable[table] = await tableColumns(client, table);

    await client.query('BEGIN');
    await client.query(`TRUNCATE ${RESTORE_TABLES.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);

    for (const table of RESTORE_ORDER) {
      await insertRows(client, table, snapshot.data[table], columnsByTable[table]);
    }

    for (const table of SERIAL_TABLES) await resetSerial(client, table);

    const restoredCounts = await tableCounts(client, RESTORE_TABLES);
    const mismatches = RESTORE_TABLES.filter((table) => restoredCounts[table] !== snapshot.counts[table]);
    if (mismatches.length) {
      throw new Error(
        `Restored counts did not match snapshot: ${mismatches.map((table) => `${table} expected ${snapshot.counts[table]} got ${restoredCounts[table]}`).join('; ')}`,
      );
    }

    await client.query('COMMIT');
    return restoredCounts;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failures so the original restore error stays visible.
    }
    throw err;
  } finally {
    client.release();
  }
}

try {
  const snapshot = JSON.parse(await readFile(args.file, 'utf8'));
  validateSnapshot(snapshot);

  console.log(`Restoring ${args.file}`);
  console.log(`Target: ${redactDatabaseUrl(process.env.DATABASE_URL)}`);
  const counts = await restoreSnapshot(snapshot);
  await pool.end();

  console.log(`Restore complete: ${counts.companies} companies, ${counts.contacts} contacts, ${counts.activities} activities.`);
  console.log('Not restored: app_settings, webhooks.secret.');
} catch (err) {
  if (pool) await pool.end().catch(() => {});
  console.error(`Restore failed: ${err.message}`);
  process.exit(1);
}
