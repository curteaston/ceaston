import { randomBytes } from 'crypto';
import { createDbPool } from '../server/src/db.js';

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

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return value;
  }
}

function readSpec(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`DATABASE_URL must use postgres:// or postgresql://, got ${url.protocol}`);
  }
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'postgres'),
  };
}

function databaseUrlForRole(databaseUrl, role, password) {
  const url = new URL(databaseUrl);
  url.username = encodeURIComponent(role);
  url.password = password ? encodeURIComponent(password) : '';
  return url.toString();
}

async function expectWriteRejected(pool, adminPool) {
  let createdProbeTable = false;
  try {
    await pool.query('SET default_transaction_read_only = off');
    await pool.query('UPDATE companies SET name = name WHERE false');
    throw new Error('read-only role was able to run UPDATE against companies');
  } catch (err) {
    if (err.message.includes('read-only role was able')) throw err;
  }

  try {
    await pool.query('SET default_transaction_read_only = off');
    await pool.query('CREATE TABLE __crm_readonly_probe (id integer)');
    createdProbeTable = true;
    throw new Error('read-only role was able to create a table in public schema');
  } catch (err) {
    if (err.message.includes('read-only role was able')) throw err;
  } finally {
    if (createdProbeTable) await adminPool.query('DROP TABLE IF EXISTS __crm_readonly_probe');
  }
}

const databaseUrl = process.env.DATABASE_URL || defaultDatabaseUrl();
const spec = readSpec(databaseUrl);
const role = process.env.CRM_READONLY_ROLE || 'crm_readonly';
const generatedPassword = !Object.hasOwn(process.env, 'CRM_READONLY_PASSWORD');
const password = generatedPassword ? randomBytes(18).toString('base64url') : process.env.CRM_READONLY_PASSWORD;

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(role)) throw new Error(`Unsafe read-only role name: ${role}`);

const adminPool = createDbPool(databaseUrl);
const readOnlyPool = createDbPool(databaseUrlForRole(databaseUrl, role, password));

try {
  const roleIdentifier = quoteIdentifier(role);
  const databaseIdentifier = quoteIdentifier(spec.database);

  await adminPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${sqlLiteral(role)}) THEN
        CREATE ROLE ${roleIdentifier} LOGIN PASSWORD ${sqlLiteral(password)};
      ELSE
        ALTER ROLE ${roleIdentifier} LOGIN PASSWORD ${sqlLiteral(password)};
      END IF;
    END $$;
  `);

  await adminPool.query(`ALTER ROLE ${roleIdentifier} IN DATABASE ${databaseIdentifier} SET default_transaction_read_only = on`);
  await adminPool.query(`GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${roleIdentifier}`);
  await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`);
  await adminPool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${roleIdentifier}`);
  await adminPool.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${roleIdentifier}`);
  await adminPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${roleIdentifier}`);
  await adminPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO ${roleIdentifier}`);

  const selectProbe = await readOnlyPool.query('SELECT count(*)::integer AS companies FROM companies');
  await expectWriteRejected(readOnlyPool, adminPool);

  console.log('Read-only CRM database role is ready.');
  console.log(`Database: ${redactDatabaseUrl(databaseUrl)}`);
  console.log('');
  console.log('DBeaver connection:');
  console.log(`Host: ${spec.host}`);
  console.log(`Port: ${spec.port}`);
  console.log(`Database: ${spec.database}`);
  console.log(`Username: ${role}`);
  console.log(`Password: ${password}`);
  console.log('');
  console.log(`Read probe: companies=${selectProbe.rows[0].companies}`);
  console.log('Write probes: rejected');
  if (generatedPassword) {
    console.log('');
    console.log('This password was generated for this run. Save it in DBeaver if your local Postgres prompts for one.');
  }
} catch (err) {
  process.exitCode = 1;
  console.error(err.message || err);
} finally {
  await readOnlyPool.end();
  await adminPool.end();
}
