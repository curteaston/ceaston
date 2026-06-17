import { createDbPool, getMigrationStatus, runMigrations } from '../server/src/db.js';

function defaultDatabaseUrl() {
  const user = process.env.LOCAL_CRM_DBUSER || 'crm';
  const port = process.env.LOCAL_CRM_PGPORT || '55432';
  const database = process.env.LOCAL_CRM_DB || 'hvac_crm';
  return `postgres://${user}@127.0.0.1:${port}/${database}`;
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function databaseUrlForName(databaseUrl, databaseName) {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.toString();
}

function adminDatabaseUrl(databaseUrl) {
  return databaseUrlForName(databaseUrl, 'postgres');
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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function collectRows(pool, kind, sql) {
  const result = await pool.query(sql);
  return result.rows.map((row) => `${kind}\t${stableStringify(row)}`);
}

async function collectSchema(pool) {
  const parts = [
    ...(await collectRows(pool, 'table', `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)),
    ...(await collectRows(pool, 'column', `
      SELECT
        table_name,
        column_name,
        ordinal_position,
        column_default,
        is_nullable,
        data_type,
        udt_name,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `)),
    ...(await collectRows(pool, 'constraint', `
      SELECT
        c.conrelid::regclass::text AS table_name,
        c.conname,
        c.contype,
        c.convalidated,
        pg_get_constraintdef(c.oid, true) AS definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
      ORDER BY c.conrelid::regclass::text, c.conname
    `)),
    ...(await collectRows(pool, 'index', `
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `)),
    ...(await collectRows(pool, 'sequence', `
      SELECT
        sequence_name,
        data_type,
        start_value,
        minimum_value,
        maximum_value,
        increment,
        cycle_option
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name
    `)),
  ];
  return parts.sort();
}

function printDiff(label, rows) {
  if (!rows.length) return;
  console.log('');
  console.log(`${label} (${rows.length}):`);
  for (const row of rows.slice(0, 40)) console.log(`- ${row}`);
  if (rows.length > 40) console.log(`...and ${rows.length - 40} more`);
}

function assertMigrationStatusClean(status) {
  const bad = status.migrations.filter((migration) => migration.status !== 'applied');
  if (bad.length || status.unknown.length) {
    const details = [
      ...bad.map((migration) => `${migration.id}:${migration.status}`),
      ...status.unknown.map((migration) => `${migration.id}:unknown`),
    ].join(', ');
    throw new Error(`Migration status is not clean: ${details}`);
  }
}

const databaseUrl = process.env.DATABASE_URL || defaultDatabaseUrl();
const expectedDatabaseName = `hvac_crm_schema_check_${Date.now()}_${process.pid}`;
const expectedDatabaseUrl = databaseUrlForName(databaseUrl, expectedDatabaseName);

const actualPool = createDbPool(databaseUrl);
const adminPool = createDbPool(adminDatabaseUrl(databaseUrl));
const expectedPool = createDbPool(expectedDatabaseUrl);

try {
  console.log(`Checking schema drift for ${redactDatabaseUrl(databaseUrl)}...`);
  assertMigrationStatusClean(await getMigrationStatus(actualPool));

  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(expectedDatabaseName)}`);
  await runMigrations(expectedPool);

  const actual = await collectSchema(actualPool);
  const expected = await collectSchema(expectedPool);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missingFromActual = expected.filter((row) => !actualSet.has(row));
  const unexpectedInActual = actual.filter((row) => !expectedSet.has(row));

  if (missingFromActual.length || unexpectedInActual.length) {
    printDiff('Expected schema entries missing from configured database', missingFromActual);
    printDiff('Unexpected schema entries in configured database', unexpectedInActual);
    throw new Error('Schema drift detected. Fix with a tracked migration, not a manual DBeaver edit.');
  }

  console.log(`Schema drift check passed (${actual.length} schema entries matched).`);
} catch (err) {
  process.exitCode = 1;
  console.error(err.message || err);
} finally {
  await expectedPool.end().catch(() => {});
  await actualPool.end().catch(() => {});
  await adminPool.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = ${sqlLiteral(expectedDatabaseName)}
       AND pid <> pg_backend_pid()`,
  ).catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(expectedDatabaseName)} WITH (FORCE)`).catch(() => {});
  await adminPool.end().catch(() => {});
}
