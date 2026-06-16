import { Router } from 'express';
import { query } from '../db.js';
import { h, STAGES } from '../util.js';

const router = Router();

const FUNNEL = STAGES.filter((s) => s !== 'lost'); // lead → ... → won

router.get('/', h(async (req, res) => {
  const [totals, activity7, activity30, byType30, notes7, tasks, stages, dueSoon, recent] = await Promise.all([
    query(`SELECT
      (SELECT count(*) FROM companies WHERE archived_at IS NULL)::int AS companies,
      (SELECT count(*) FROM contacts ct JOIN companies co ON co.id = ct.company_id WHERE co.archived_at IS NULL)::int AS contacts,
      (SELECT count(*) FROM deals d JOIN companies co ON co.id = d.company_id WHERE co.archived_at IS NULL)::int AS deals,
      (SELECT count(*) FROM deals d JOIN companies co ON co.id = d.company_id WHERE co.archived_at IS NULL AND d.stage NOT IN ('won','lost'))::int AS open_deals,
      (SELECT coalesce(sum(d.value),0) FROM deals d JOIN companies co ON co.id = d.company_id WHERE co.archived_at IS NULL AND d.stage NOT IN ('won','lost')) AS pipeline_value,
      (SELECT coalesce(sum(d.value),0) FROM deals d JOIN companies co ON co.id = d.company_id WHERE co.archived_at IS NULL AND d.stage = 'won') AS won_value`),
    query(`SELECT count(*)::int AS n FROM activities a JOIN companies co ON co.id = a.company_id WHERE co.archived_at IS NULL AND a.occurred_at > now() - interval '7 days' AND a.type <> 'stage_change'`),
    query(`SELECT count(*)::int AS n FROM activities a JOIN companies co ON co.id = a.company_id WHERE co.archived_at IS NULL AND a.occurred_at > now() - interval '30 days' AND a.type <> 'stage_change'`),
    query(`SELECT a.type, count(*)::int AS n FROM activities a
           JOIN companies co ON co.id = a.company_id
           WHERE co.archived_at IS NULL AND a.occurred_at > now() - interval '30 days' AND a.type <> 'stage_change'
           GROUP BY a.type ORDER BY n DESC`),
    query(`SELECT count(*)::int AS n FROM notes n JOIN companies co ON co.id = n.company_id WHERE co.archived_at IS NULL AND n.created_at > now() - interval '7 days'`),
    query(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE completed)::int AS completed,
                  count(*) FILTER (WHERE NOT completed AND due_date < CURRENT_DATE)::int AS overdue,
                  count(*) FILTER (WHERE NOT completed AND due_date = CURRENT_DATE)::int AS due_today
           FROM tasks t
           LEFT JOIN companies co ON co.id = t.company_id
           LEFT JOIN contacts ct ON ct.id = t.contact_id
           LEFT JOIN companies co2 ON co2.id = ct.company_id
           WHERE coalesce(co.archived_at, co2.archived_at) IS NULL`),
    query(`SELECT d.stage, count(*)::int AS count, coalesce(sum(d.value),0) AS value
           FROM deals d JOIN companies co ON co.id = d.company_id
           WHERE co.archived_at IS NULL
           GROUP BY d.stage`),
    query(`SELECT t.*, co.name AS company_name, ct.name AS contact_name FROM tasks t
           LEFT JOIN companies co ON co.id = t.company_id
           LEFT JOIN contacts ct ON ct.id = t.contact_id
           LEFT JOIN companies co2 ON co2.id = ct.company_id
           WHERE coalesce(co.archived_at, co2.archived_at) IS NULL
             AND NOT t.completed AND (t.due_date <= CURRENT_DATE + 7 OR t.due_date IS NULL)
           ORDER BY t.due_date NULLS LAST LIMIT 10`),
    query(`SELECT a.*, co.name AS company_name, ct.name AS contact_name FROM activities a
           JOIN companies co ON co.id = a.company_id
           LEFT JOIN contacts ct ON ct.id = a.contact_id
           WHERE co.archived_at IS NULL
           ORDER BY a.occurred_at DESC LIMIT 10`),
  ]);

  const stageCounts = Object.fromEntries(stages.rows.map((r) => [r.stage, r]));
  const funnel = FUNNEL.map((stage) => ({
    stage,
    count: stageCounts[stage]?.count || 0,
    value: Number(stageCounts[stage]?.value || 0),
  }));

  // Conversion rate between adjacent stages, based on deals currently at-or-beyond each
  // stage (lost deals excluded — win rate covers them).
  const atOrBeyond = FUNNEL.map((_, i) =>
    funnel.slice(i).reduce((sum, s) => sum + s.count, 0)
  );
  const conversion = FUNNEL.slice(0, -1).map((stage, i) => ({
    from: stage,
    to: FUNNEL[i + 1],
    rate: atOrBeyond[i] ? Math.round((atOrBeyond[i + 1] / atOrBeyond[i]) * 100) : null,
  }));

  const won = stageCounts.won?.count || 0;
  const lost = stageCounts.lost?.count || 0;
  const t = tasks.rows[0];
  const totalsRow = totals.rows[0];

  res.json({
    totals: totalsRow,
    contacts_per_company: totalsRow.companies
      ? Math.round((totalsRow.contacts / totalsRow.companies) * 10) / 10
      : 0,
    activity: {
      last_7_days: activity7.rows[0].n,
      last_30_days: activity30.rows[0].n,
      notes_last_7_days: notes7.rows[0].n,
      by_type_30_days: byType30.rows,
    },
    tasks: {
      ...t,
      completion_rate: t.total ? Math.round((t.completed / t.total) * 100) : null,
    },
    funnel,
    conversion,
    win_rate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
    upcoming_tasks: dueSoon.rows,
    recent_activity: recent.rows,
  });
}));

export default router;
