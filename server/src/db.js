import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

export const pool = new Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : undefined
);

export const query = (text, params) => pool.query(text, params);

export async function initDb() {
  const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');
  await pool.query(schema);
}

// Bump a company's last-activity timestamp whenever anything happens on it.
export async function touchCompany(companyId, when) {
  await query(
    `UPDATE companies SET last_activity_at = GREATEST(coalesce(last_activity_at, 'epoch'), $2)
     WHERE id = $1`,
    [companyId, when || new Date()]
  );
}
