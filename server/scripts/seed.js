// Seeds a handful of demo HVAC prospects. Usage: npm run seed
const BASE = process.env.CRM_URL || 'http://localhost:3001';
const HEADERS = {
  'Content-Type': 'application/json',
  ...(process.env.API_KEY ? { 'X-Api-Key': process.env.API_KEY } : {}),
};

async function post(path, body) {
  const res = await fetch(`${BASE}/api${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const companies = [
  { name: 'Arctic Air Solutions', domain: 'arcticairsolutions.com', employee_count: 24, ad_spend_range: '$1k-$5k', website: 'https://arcticairsolutions.com',
    contacts: [
      { name: 'Mike Reynolds', title: 'Owner', email: 'mike@arcticairsolutions.com', phone: '555-201-3344', source: 'cold list' },
      { name: 'Dana Ortiz', title: 'Office Manager', email: 'dana@arcticairsolutions.com', phone: '555-201-3345', source: 'cold list' },
    ] },
  { name: 'Comfort Pro Heating & Cooling', domain: 'comfortprohvac.com', employee_count: 55, ad_spend_range: '$5k-$10k', website: 'https://comfortprohvac.com',
    contacts: [{ name: 'Sarah Kim', title: 'Marketing Director', email: 'sarah@comfortprohvac.com', phone: '555-887-1200', source: 'LinkedIn' }] },
  { name: 'Valley Mechanical', domain: 'valleymech.com', employee_count: 12, ad_spend_range: '<$1k', website: 'https://valleymech.com',
    contacts: [{ name: 'Tom Brady Jr', title: 'GM', email: 'tom@valleymech.com', phone: '555-440-9911', source: 'referral' }] },
  { name: 'Summit Climate Services', domain: 'summitclimate.com', employee_count: 130, ad_spend_range: '$10k-$25k', website: 'https://summitclimate.com',
    contacts: [
      { name: 'Lisa Tran', title: 'VP Operations', email: 'lisa@summitclimate.com', phone: '555-303-7788', source: 'conference' },
      { name: 'Raj Patel', title: 'Marketing Manager', email: 'raj@summitclimate.com', phone: '555-303-7789', source: 'conference' },
    ] },
  { name: 'Blue Flame Heating', domain: 'blueflameheat.com', employee_count: 8, ad_spend_range: '$0', website: 'https://blueflameheat.com',
    contacts: [{ name: 'Carl Jensen', title: 'Owner', email: 'carl@blueflameheat.com', phone: '555-918-2233', source: 'cold list' }] },
];

const run = async () => {
  const summary = await post('/import', { companies });
  console.log('Import:', summary);

  const lookup = async (domain) => {
    const res = await fetch(`${BASE}/api/companies/lookup?domain=${domain}`, { headers: HEADERS });
    return res.json();
  };

  const arctic = await lookup('arcticairsolutions.com');
  const summit = await lookup('summitclimate.com');
  const comfort = await lookup('comfortprohvac.com');
  const byName = (co, name) => co.contacts.find((c) => c.name === name);

  await post('/deals', { company_id: arctic.id, name: 'Arctic Air — PPC management', value: 2400, stage: 'qualified', expected_close_date: '2026-07-15' });
  await post('/deals', { company_id: summit.id, name: 'Summit — full funnel retainer', value: 8500, stage: 'proposal', expected_close_date: '2026-06-30' });
  await post('/deals', { company_id: comfort.id, name: 'Comfort Pro — LSA setup', value: 1800, stage: 'contacted' });

  await post('/activities', { contact_id: byName(arctic, 'Mike Reynolds').id, type: 'call', outcome: 'connected', body: 'Spoke with Mike, interested in lead gen, asked for case studies.' });
  await post('/activities', { contact_id: byName(summit, 'Lisa Tran').id, type: 'email', outcome: 'replied', body: 'Lisa replied asking for proposal by end of month.' });
  await post('/notes', { company_id: arctic.id, body: 'Currently spending ~$2k/mo on Google Ads with poor ROI. Decision maker is Mike.', source: 'typed' });

  await post('/tasks', { company_id: summit.id, description: 'Send proposal to Lisa', due_date: '2026-06-16', priority: 'high', owner: 'me' });
  await post('/tasks', { contact_id: byName(arctic, 'Mike Reynolds').id, description: 'Follow up call with Mike re: case studies', due_date: '2026-06-13', priority: 'high', owner: 'me' });
  await post('/tasks', { company_id: comfort.id, description: 'Connect with Sarah on LinkedIn', due_date: '2026-06-18', priority: 'low', owner: 'me' });

  console.log('Seed complete.');
};

run().catch((e) => { console.error(e); process.exit(1); });
