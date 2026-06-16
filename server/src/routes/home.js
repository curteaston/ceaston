import { Router } from 'express';
import { query } from '../db.js';
import { h } from '../util.js';

const router = Router();

const TASK_SELECT = `
  SELECT t.*, coalesce(t.company_id, ct.company_id) AS company_id,
         coalesce(co.name, co2.name) AS company_name, ct.name AS contact_name
  FROM tasks t
  LEFT JOIN companies co ON co.id = t.company_id
  LEFT JOIN contacts ct ON ct.id = t.contact_id
  LEFT JOIN companies co2 ON co2.id = ct.company_id`;

// GET /api/home — everything the home screen needs in one payload.
router.get('/', h(async (req, res) => {
  const [meetings, tasksOpen, tasksCompleted, overdue, pastDueDeals, staleCompanies, nextActions, recent] = await Promise.all([
    query(
      `SELECT a.*, co.name AS company_name, ct.name AS contact_name
       FROM activities a
       JOIN companies co ON co.id = a.company_id
       LEFT JOIN contacts ct ON ct.id = a.contact_id
       WHERE co.archived_at IS NULL AND a.type = 'meeting' AND a.occurred_at::date = CURRENT_DATE
       ORDER BY a.occurred_at`),
    query(`${TASK_SELECT} WHERE coalesce(co.archived_at, co2.archived_at) IS NULL
             AND NOT t.completed AND t.due_date = CURRENT_DATE
           ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`),
    query(`${TASK_SELECT} WHERE coalesce(co.archived_at, co2.archived_at) IS NULL
             AND t.completed AND t.completed_at::date = CURRENT_DATE
           ORDER BY t.completed_at DESC`),
    query(`${TASK_SELECT} WHERE coalesce(co.archived_at, co2.archived_at) IS NULL
             AND NOT t.completed AND t.due_date < CURRENT_DATE
           ORDER BY t.due_date, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
           LIMIT 25`),
    query(
      `SELECT d.*, co.name AS company_name FROM deals d
       JOIN companies co ON co.id = d.company_id
       WHERE co.archived_at IS NULL AND d.stage NOT IN ('won','lost') AND d.expected_close_date < CURRENT_DATE
       ORDER BY d.expected_close_date LIMIT 25`),
    query(
      `SELECT co.id, co.name, co.domain, co.last_activity_at,
              (SELECT coalesce(sum(d.value),0) FROM deals d
                WHERE d.company_id = co.id AND d.stage NOT IN ('won','lost')) AS open_deal_value
       FROM companies co
       WHERE co.archived_at IS NULL
         AND EXISTS (SELECT 1 FROM deals d WHERE d.company_id = co.id AND d.stage NOT IN ('won','lost'))
         AND (co.last_activity_at IS NULL OR co.last_activity_at < now() - interval '14 days')
       ORDER BY co.last_activity_at NULLS FIRST LIMIT 10`),
    query(
      `SELECT co.id, co.name, co.domain, co.target_tier, co.source, co.campaign,
              co.next_step, co.buying_committee_status, co.last_activity_at,
              co.last_touch_channel, co.owner,
              (SELECT count(*) FROM contacts ct WHERE ct.company_id = co.id)::int AS contact_count,
              (SELECT count(*) FROM contacts ct WHERE ct.company_id = co.id AND ct.contact_role IS NOT NULL)::int AS mapped_contacts,
              (SELECT coalesce(json_agg(DISTINCT ct.contact_role) FILTER (WHERE ct.contact_role IS NOT NULL), '[]'::json)
                 FROM contacts ct WHERE ct.company_id = co.id) AS roles,
              (SELECT json_build_object('id', t.id, 'description', t.description, 'due_date', t.due_date, 'priority', t.priority)
                 FROM tasks t
                 WHERE (t.company_id = co.id OR t.contact_id IN (SELECT id FROM contacts WHERE company_id = co.id))
                   AND NOT t.completed
                 ORDER BY t.due_date NULLS LAST, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
                 LIMIT 1) AS next_task
       FROM companies co
       WHERE co.archived_at IS NULL
         AND NOT (co.do_not_contact OR co.not_interested OR co.bad_fit)
         AND co.lifecycle_stage NOT IN ('customer', 'evangelist')
       ORDER BY
         CASE co.target_tier WHEN 'tier_1' THEN 0 WHEN 'tier_2' THEN 1 WHEN 'tier_3' THEN 2 ELSE 3 END,
         CASE
           WHEN co.next_step IS NOT NULL AND co.next_step <> '' THEN 0
           WHEN EXISTS (
             SELECT 1 FROM tasks t
             WHERE (t.company_id = co.id OR t.contact_id IN (SELECT id FROM contacts WHERE company_id = co.id))
               AND NOT t.completed
           ) THEN 1
           WHEN co.last_activity_at IS NULL THEN 2
           ELSE 3
         END,
         co.last_activity_at NULLS FIRST
       LIMIT 12`),
    query(
      `SELECT * FROM (
         SELECT 'note' AS kind, n.id, n.company_id, co.name AS company_name,
                n.contact_id, ct.name AS contact_name, n.body, n.source,
                NULL AS type, NULL AS outcome, n.created_at AS occurred_at
           FROM notes n
           JOIN companies co ON co.id = n.company_id
           LEFT JOIN contacts ct ON ct.id = n.contact_id
          WHERE co.archived_at IS NULL
         UNION ALL
         SELECT 'activity', a.id, a.company_id, co.name, a.contact_id, ct.name,
                a.body, NULL, a.type, a.outcome, a.occurred_at
           FROM activities a
           JOIN companies co ON co.id = a.company_id
           LEFT JOIN contacts ct ON ct.id = a.contact_id
          WHERE co.archived_at IS NULL
       ) t ORDER BY occurred_at DESC LIMIT 30`),
  ]);

  res.json({
    meetings_today: meetings.rows,
    tasks_today: { open: tasksOpen.rows, completed: tasksCompleted.rows },
    needs_attention: {
      overdue_tasks: overdue.rows,
      past_due_deals: pastDueDeals.rows,
      stale_companies: staleCompanies.rows,
    },
    next_actions: nextActions.rows,
    recent_activity: recent.rows,
  });
}));

export default router;
