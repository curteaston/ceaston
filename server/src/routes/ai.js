import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { h, notFound } from '../util.js';
import { fullCompanyPayload } from './companies.js';

const router = Router();

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

function describeCompany(c) {
  const lines = [
    `Company: ${c.name}${c.domain ? ` (${c.domain})` : ''}`,
    `Industry: ${c.industry || 'unknown'} · Employees: ${c.employee_count ?? 'unknown'} · Monthly ad spend: ${c.ad_spend_range || 'unknown'}`,
    `Owner: ${c.owner || 'unassigned'} · Lifecycle stage: ${c.lifecycle_stage} · Added: ${c.created_at} · Last activity: ${c.last_activity_at || 'never'}`,
    '',
    `Contacts (${c.contacts.length}):`,
    ...c.contacts.map((ct) =>
      `- ${ct.name}${ct.title ? `, ${ct.title}` : ''} (${ct.email || 'no email'}, ${ct.phone || 'no phone'}) — lead status: ${ct.lead_status}, last contacted: ${ct.last_contacted_at || 'never'}`),
    '',
    `Deals (${c.deals.length}):`,
    ...c.deals.map((d) => `- "${d.name}" — $${d.value}, stage: ${d.stage}, ${d.probability}% probability, expected close: ${d.expected_close_date || 'unset'}`),
    '',
    `Open tasks (${c.tasks.filter((t) => !t.completed).length}):`,
    ...c.tasks.filter((t) => !t.completed).map((t) => `- ${t.description} (due ${t.due_date || 'unset'}, ${t.priority})`),
    '',
    'Activity timeline (newest first):',
    ...c.timeline.slice(0, 40).map((t) =>
      `- [${t.occurred_at}] ${t.kind === 'note' ? 'NOTE' : (t.type || 'activity').toUpperCase()}${t.outcome ? ` (${t.outcome})` : ''}${t.contact_name ? ` with ${t.contact_name}` : ''}: ${(t.body || '').slice(0, 300)}`),
  ];
  return lines.join('\n');
}

// Deterministic fallback when no ANTHROPIC_API_KEY is configured.
function basicSummary(c) {
  const openDeals = c.deals.filter((d) => !['won', 'lost'].includes(d.stage));
  const pipeline = openDeals.reduce((s, d) => s + Number(d.value), 0);
  const overdue = c.tasks.filter((t) => !t.completed && t.due_date && new Date(t.due_date) < new Date());
  const lastTouch = c.timeline[0];
  const parts = [
    `${c.name} is a ${c.employee_count ?? 'unknown-size'}-employee ${c.industry || ''} company` +
      `${c.ad_spend_range && c.ad_spend_range !== 'unknown' ? ` spending ${c.ad_spend_range}/mo on ads` : ''}, currently at the "${c.lifecycle_stage}" lifecycle stage.`,
    `There ${c.contacts.length === 1 ? 'is 1 contact' : `are ${c.contacts.length} contacts`} on record` +
      (c.contacts.length ? ` — key contact: ${c.contacts[0].name}${c.contacts[0].title ? ` (${c.contacts[0].title})` : ''}.` : '.'),
    openDeals.length
      ? `Open pipeline: $${pipeline.toLocaleString()} across ${openDeals.length} deal(s); furthest stage is "${openDeals[0].stage}".`
      : 'No open deals yet.',
    lastTouch
      ? `Last activity (${new Date(lastTouch.occurred_at).toLocaleDateString()}): ${lastTouch.kind === 'note' ? 'note' : lastTouch.type}${lastTouch.body ? ` — "${lastTouch.body.slice(0, 140)}"` : ''}.`
      : 'No activity has been logged yet.',
    overdue.length ? `⚠ ${overdue.length} task(s) overdue — next: "${overdue[0].description}".` : null,
  ];
  return parts.filter(Boolean).join('\n\n');
}

// POST /api/companies/:id/summary — AI-powered lead summary for the side panel
router.post('/companies/:id/summary', h(async (req, res) => {
  const company = await fullCompanyPayload(req.params.id);
  if (!company) throw notFound('Company not found');

  if (!client) {
    return res.json({ summary: basicSummary(company), source: 'basic' });
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system:
      'You are an assistant inside a B2B CRM used by a solo sales operator prospecting HVAC contractors. ' +
      'Summarize the lead below for someone about to make their next touch. Be concrete and skimmable. Cover: ' +
      '(1) who the company and key contacts are, (2) deal pipeline state and money at stake, (3) what has happened ' +
      'recently and the current relationship temperature, (4) open/overdue tasks, and (5) a recommended next action. ' +
      'Use short paragraphs or bullets, no preamble, under 250 words.',
    messages: [{ role: 'user', content: describeCompany(company) }],
  });

  const summary = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  res.json({ summary, source: 'ai', model: response.model });
}));

export default router;
