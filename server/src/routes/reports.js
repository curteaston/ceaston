import { Router } from 'express';
import { query } from '../db.js';
import { h, STAGES } from '../util.js';

const router = Router();

const FUNNEL = STAGES.filter((s) => s !== 'lost');

function rangeFromQuery(q) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(Date.now() - 29 * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', h(async (req, res) => {
  const { from, to } = rangeFromQuery(req.query);

  const [byDay, byType, newRows, deals, tasks, seq, perSeq, funnel, topActive] = await Promise.all([
    query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
              count(a.id)::int AS activities
       FROM generate_series($1::date, $2::date, '1 day') d
       LEFT JOIN activities a ON a.occurred_at::date = d::date AND a.type <> 'stage_change'
       GROUP BY d ORDER BY d`,
      [from, to]
    ),
    query(
      `SELECT type, count(*)::int AS n FROM activities
       WHERE occurred_at::date BETWEEN $1 AND $2 AND type <> 'stage_change'
       GROUP BY type ORDER BY n DESC`,
      [from, to]
    ),
    query(
      `SELECT
        (SELECT count(*) FROM companies WHERE created_at::date BETWEEN $1 AND $2)::int AS companies,
        (SELECT count(*) FROM contacts WHERE created_at::date BETWEEN $1 AND $2)::int AS contacts,
        (SELECT count(*) FROM notes WHERE created_at::date BETWEEN $1 AND $2)::int AS notes`,
      [from, to]
    ),
    query(
      `SELECT
        (SELECT count(*) FROM deals WHERE created_at::date BETWEEN $1 AND $2)::int AS created,
        (SELECT count(*) FROM deals WHERE stage='won' AND updated_at::date BETWEEN $1 AND $2)::int AS won,
        (SELECT count(*) FROM deals WHERE stage='lost' AND updated_at::date BETWEEN $1 AND $2)::int AS lost,
        (SELECT coalesce(sum(value),0) FROM deals WHERE stage='won' AND updated_at::date BETWEEN $1 AND $2) AS won_value`,
      [from, to]
    ),
    query(
      `SELECT
        (SELECT count(*) FROM tasks WHERE created_at::date BETWEEN $1 AND $2)::int AS created,
        (SELECT count(*) FROM tasks WHERE completed_at::date BETWEEN $1 AND $2)::int AS completed`,
      [from, to]
    ),
    query(
      `SELECT
        (SELECT count(*) FROM sequence_enrollments WHERE enrolled_at::date BETWEEN $1 AND $2)::int AS enrolled,
        (SELECT count(*) FROM sequence_step_runs WHERE status='sent' AND sent_at::date BETWEEN $1 AND $2)::int AS emails_sent,
        (SELECT count(*) FROM sequence_enrollments WHERE status='replied' AND finished_at::date BETWEEN $1 AND $2)::int AS replies`,
      [from, to]
    ),
    query(
      `SELECT s.name,
        count(DISTINCT e.id)::int AS enrollments,
        count(*) FILTER (WHERE r.status='sent' AND r.sent_at::date BETWEEN $1 AND $2)::int AS emails_sent,
        count(DISTINCT e.id) FILTER (WHERE e.status='replied' AND e.finished_at::date BETWEEN $1 AND $2)::int AS replies
       FROM sequences s
       LEFT JOIN sequence_enrollments e ON e.sequence_id = s.id
       LEFT JOIN sequence_step_runs r ON r.enrollment_id = e.id
       GROUP BY s.id, s.name ORDER BY enrollments DESC`,
      [from, to]
    ),
    query(`SELECT stage, count(*)::int AS count FROM deals GROUP BY stage`),
    query(
      `SELECT co.id, co.name, count(a.id)::int AS activities
       FROM activities a JOIN companies co ON co.id = a.company_id
       WHERE a.occurred_at::date BETWEEN $1 AND $2 AND a.type <> 'stage_change'
       GROUP BY co.id, co.name ORDER BY activities DESC LIMIT 8`,
      [from, to]
    ),
  ]);

  const stageCounts = Object.fromEntries(funnel.rows.map((r) => [r.stage, r.count]));
  const d = deals.rows[0];
  const t = tasks.rows[0];

  res.json({
    range: { from, to },
    new: newRows.rows[0],
    activity_by_day: byDay.rows,
    activity_by_type: byType.rows,
    activity_total: byType.rows.reduce((s, r) => s + r.n, 0),
    deals: { ...d, win_rate: d.won + d.lost ? Math.round((d.won / (d.won + d.lost)) * 100) : null },
    tasks: { ...t, completion_rate: t.created ? Math.round((t.completed / t.created) * 100) : null },
    sequences: { ...seq.rows[0], per_sequence: perSeq.rows },
    funnel: FUNNEL.map((stage) => ({ stage, count: stageCounts[stage] || 0 })),
    top_active_companies: topActive.rows,
  });
}));

export default router;
