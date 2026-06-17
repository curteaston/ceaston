import pg from 'pg';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { basename, dirname, join } from 'path';

const { Pool } = pg;
const MIGRATIONS_TABLE = 'crm_schema_migrations';

export function createDbPool(databaseUrl = process.env.DATABASE_URL) {
  return new Pool(databaseUrl ? { connectionString: databaseUrl } : undefined);
}

export const pool = createDbPool();

export const query = (text, params) => pool.query(text, params);

const srcDir = dirname(fileURLToPath(import.meta.url));

function checksumSql(sql) {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function readSql(path) {
  const sql = readFileSync(path, 'utf8').trim();
  if (!sql) throw new Error(`Migration file is empty: ${path}`);
  return sql;
}

function loadDefinedMigrations() {
  const migrations = [
    {
      id: '001_bootstrap_schema',
      source: 'server/src/schema.sql',
      sql: readSql(join(srcDir, 'schema.sql')),
    },
  ];

  const migrationsDir = join(srcDir, 'migrations');
  if (existsSync(migrationsDir)) {
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
      const id = basename(file, '.sql');
      if (!/^\d{3}_[a-z0-9_]+$/.test(id)) {
        throw new Error(`Invalid migration filename "${file}". Use NNN_lowercase_name.sql.`);
      }
      if (id === '001_bootstrap_schema') {
        throw new Error('Do not create a migration named 001_bootstrap_schema.sql; schema.sql is the baseline.');
      }
      migrations.push({
        id,
        source: `server/src/migrations/${file}`,
        sql: readSql(join(migrationsDir, file)),
      });
    }
  }

  const seen = new Set();
  for (const migration of migrations) {
    if (seen.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`);
    seen.add(migration.id);
    migration.checksum = checksumSql(migration.sql);
  }
  return migrations;
}

async function migrationTableExists(targetPool) {
  const result = await targetPool.query(`SELECT to_regclass('public.${MIGRATIONS_TABLE}') AS table_name`);
  return Boolean(result.rows[0]?.table_name);
}

async function ensureMigrationTable(targetPool) {
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function readAppliedMigrations(targetPool, { createTable = false } = {}) {
  if (createTable) {
    await ensureMigrationTable(targetPool);
  } else if (!(await migrationTableExists(targetPool))) {
    return [];
  }

  const result = await targetPool.query(
    `SELECT id, checksum, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id`,
  );
  return result.rows;
}

function findUnknownAppliedMigrations(defined, applied) {
  const definedIds = new Set(defined.map((migration) => migration.id));
  return applied.filter((migration) => !definedIds.has(migration.id));
}

export async function getMigrationStatus(targetPool = pool) {
  const defined = loadDefinedMigrations();
  const applied = await readAppliedMigrations(targetPool);
  const appliedById = new Map(applied.map((migration) => [migration.id, migration]));
  const migrations = defined.map(({ id, source, checksum }) => {
    const existing = appliedById.get(id);
    return {
      id,
      source,
      checksum,
      applied_checksum: existing?.checksum || null,
      applied_at: existing?.applied_at || null,
      status: !existing ? 'pending' : existing.checksum === checksum ? 'applied' : 'checksum_mismatch',
    };
  });
  return {
    migrations,
    unknown: findUnknownAppliedMigrations(defined, applied),
  };
}

export async function runMigrations(targetPool = pool) {
  const defined = loadDefinedMigrations();
  const applied = await readAppliedMigrations(targetPool, { createTable: true });
  const unknown = findUnknownAppliedMigrations(defined, applied);
  if (unknown.length) {
    throw new Error(
      `Database has applied migrations missing from this checkout: ${unknown.map((migration) => migration.id).join(', ')}`,
    );
  }

  const appliedById = new Map(applied.map((migration) => [migration.id, migration]));
  for (const migration of defined) {
    const existing = appliedById.get(migration.id);
    if (existing) {
      if (existing.checksum !== migration.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.id}. Add a new migration instead of editing an applied one.`,
        );
      }
      continue;
    }

    console.log(`Applying database migration ${migration.id} (${migration.source})...`);
    const client = await targetPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum) VALUES ($1, $2)`,
        [migration.id, migration.checksum],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${migration.id} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

export async function initDb() {
  await runMigrations(pool);
}

// Bump a company's last-activity timestamp whenever anything happens on it.
export async function touchCompany(companyId, when) {
  await query(
    `UPDATE companies SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2)
     WHERE id = $1`,
    [companyId, when || new Date()]
  );
}
