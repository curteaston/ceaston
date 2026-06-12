export const STAGES = ['lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export const DEFAULT_PROBABILITY = {
  lead: 10, contacted: 20, qualified: 40, proposal: 60, negotiation: 80, won: 100, lost: 0,
};

export const AD_SPEND_RANGES = ['unknown', '$0', '<$1k', '$1k-$5k', '$5k-$10k', '$10k-$25k', '$25k+'];

export const LEAD_STATUSES = ['new', 'attempted', 'connected', 'qualified', 'unqualified', 'customer'];

// Wrap async route handlers so rejections hit the error middleware.
export const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);

// Build a parameterized UPDATE from the request body, restricted to allowed columns.
export function buildUpdate(table, id, body, allowed, extraSets = []) {
  const sets = [];
  const values = [];
  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, col)) {
      values.push(body[col] === '' ? null : body[col]);
      sets.push(`${col} = $${values.length}`);
    }
  }
  if (sets.length === 0) return null;
  sets.push(...extraSets);
  values.push(id);
  return {
    text: `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  };
}

export function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
