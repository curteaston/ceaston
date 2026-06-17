function defaultDatabaseUrl() {
  const user = process.env.LOCAL_CRM_DBUSER || 'crm';
  const port = process.env.LOCAL_CRM_PGPORT || '55432';
  const database = process.env.LOCAL_CRM_DB || 'hvac_crm';
  return `postgres://${user}@127.0.0.1:${port}/${database}`;
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

const { getMigrationStatus, pool, runMigrations } = await import('../server/src/db.js');

try {
  console.log(`Database: ${redactDatabaseUrl(process.env.DATABASE_URL)}`);
  await runMigrations();
  const status = await getMigrationStatus();
  const pending = status.migrations.filter((migration) => migration.status === 'pending');
  const mismatched = status.migrations.filter((migration) => migration.status === 'checksum_mismatch');

  if (mismatched.length || status.unknown.length) {
    process.exitCode = 1;
    console.error('Migration drift detected.');
  } else if (pending.length) {
    process.exitCode = 1;
    console.error(`Migrations still pending after migrate: ${pending.map((migration) => migration.id).join(', ')}`);
  } else {
    console.log(`Database migrations up to date (${status.migrations.length} applied).`);
  }
} catch (err) {
  process.exitCode = 1;
  console.error(err.message || err);
} finally {
  await pool.end();
}
