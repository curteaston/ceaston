function defaultDatabaseUrl() {
  const user = process.env.LOCAL_CRM_DBUSER || 'crm';
  const port = process.env.LOCAL_CRM_PGPORT || '55432';
  const database = process.env.LOCAL_CRM_DB || 'hvac_crm';
  return `postgres://${user}@127.0.0.1:${port}/${database}`;
}

function formatAppliedAt(value) {
  if (!value) return '-';
  if (value instanceof Date) return value.toISOString();
  return String(value);
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

process.env.DATABASE_URL ||= defaultDatabaseUrl();

const { getMigrationStatus, pool } = await import('../server/src/db.js');

try {
  const status = await getMigrationStatus();
  console.log(`Database: ${redactDatabaseUrl(process.env.DATABASE_URL)}`);
  console.log('');
  console.log('Migrations:');
  for (const migration of status.migrations) {
    console.log(`- ${migration.status.padEnd(17)} ${migration.id.padEnd(24)} ${formatAppliedAt(migration.applied_at)} ${migration.source}`);
  }

  if (status.unknown.length) {
    console.log('');
    console.log('Applied in database but missing from this checkout:');
    for (const migration of status.unknown) {
      console.log(`- ${migration.id} ${formatAppliedAt(migration.applied_at)}`);
    }
  }

  const bad = status.migrations.some((migration) => migration.status === 'checksum_mismatch') || status.unknown.length > 0;
  if (bad) process.exitCode = 1;
} catch (err) {
  process.exitCode = 1;
  console.error(err.message || err);
} finally {
  await pool.end();
}
