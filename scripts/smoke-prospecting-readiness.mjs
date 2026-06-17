const apiBase = process.env.CRM_API_URL || process.env.CRM_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`;

const headers = {
  'Content-Type': 'application/json',
  ...(process.env.API_KEY ? { 'X-Api-Key': process.env.API_KEY } : {}),
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function request(method, path, body, { expectOk = true } = {}) {
  const res = await fetch(`${apiBase}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (expectOk && !res.ok) {
    throw new Error(`${method} ${path} returned ${res.status}: ${text}`);
  }
  return { res, data, text };
}

const get = (path, options) => request('GET', path, undefined, options);
const post = (path, body, options) => request('POST', path, body, options);
const del = (path, body, options) => request('DELETE', path, body, options);

function companyDeleteConfirmation(name) {
  return `DELETE ${name}`;
}

async function deleteCompany(id, name) {
  if (!id) return;
  await del(`/companies/${id}`, { confirm: companyDeleteConfirmation(name) }, { expectOk: false });
}

function findAccount(workbench, namePart) {
  return (workbench.accounts || []).find((account) => account.name.includes(namePart));
}

async function lookupByDomain(domain) {
  return (await get(`/companies/lookup?domain=${encodeURIComponent(domain)}`)).data;
}

async function smoke() {
  const stamp = Date.now();
  const campaign = `RunWise paid lead recovery ${stamp}`;
  const companies = [
    {
      name: `Keystone Comfort Systems ${stamp}`,
      domain: `keystone-comfort-${stamp}.example`,
      industry: 'HVAC',
      employee_count: '42',
      ad_spend_range: '$10k-$25k',
      owner: 'Curt',
      target_tier: 'Tier 1',
      source: 'Apollo',
      campaign,
      buying_committee_status: 'Mapped',
      next_step: 'Call owner with paid lead leakage audit',
      contacts: [
        {
          name: 'Jordan Price',
          title: 'Owner',
          contact_role: 'Owner',
          email: `jordan@keystone-comfort-${stamp}.example`,
          phone_direct: '+1 (412) 555-0101',
          owner: 'Curt',
          source: 'Apollo',
        },
        {
          name: 'Mia Chen',
          title: 'Marketing Manager',
          contact_role: 'Marketing',
          email: `mia@keystone-comfort-${stamp}.example`,
          owner: 'Curt',
          source: 'Apollo',
        },
        {
          name: 'Owen Patel',
          title: 'Operations Manager',
          contact_role: 'Ops',
          email: `owen@keystone-comfort-${stamp}.example`,
          owner: 'Curt',
          source: 'Apollo',
        },
      ],
    },
    {
      name: `Allegheny Heating and Air ${stamp}`,
      domain: `allegheny-hvac-${stamp}.example`,
      industry: 'HVAC',
      employee_count: '31',
      ad_spend_range: '$5k-$10k',
      owner: 'Curt',
      target_tier: 'Tier 1',
      source: 'Apollo',
      campaign,
      next_step: 'Find owner and operations contact before outreach',
      contacts: [
        {
          name: 'Sara Morgan',
          title: 'Marketing Director',
          contact_role: 'Marketing',
          email: `sara@allegheny-hvac-${stamp}.example`,
          owner: 'Curt',
          source: 'Apollo',
        },
      ],
    },
    {
      name: `Blue Ridge Air Works ${stamp}`,
      domain: `blue-ridge-air-${stamp}.example`,
      industry: 'HVAC',
      employee_count: '18',
      ad_spend_range: '$1k-$5k',
      owner: 'Curt',
      target_tier: 'Tier 2',
      source: 'Google Maps',
      campaign,
      contacts: [
        {
          name: 'Drew Wallace',
          title: 'Owner',
          contact_role: 'Owner',
          email: `drew@blue-ridge-air-${stamp}.example`,
          owner: 'Curt',
          source: 'Website',
        },
        {
          name: 'Nora Brooks',
          title: 'Service Operations Manager',
          contact_role: 'Ops',
          email: `nora@blue-ridge-air-${stamp}.example`,
          owner: 'Curt',
          source: 'Website',
        },
      ],
    },
  ];
  const created = [];

  try {
    const imported = await post('/import', { companies });
    assert(imported.data.companies_created === 3, `Prospecting import should create 3 companies, got ${imported.text}`);
    assert(imported.data.contacts_created === 6, `Prospecting import should create 6 contacts, got ${imported.text}`);
    assert(imported.data.audit_batch_id, `Prospecting import should return audit_batch_id, got ${imported.text}`);

    for (const company of companies) {
      const lookup = await lookupByDomain(company.domain);
      created.push({ id: lookup.id, name: company.name });
      assert(lookup.owner === 'Curt', `${company.name} should preserve imported owner`);
      assert(lookup.campaign === campaign, `${company.name} should preserve imported campaign`);
      assert(lookup.target_tier, `${company.name} should preserve imported target tier`);
    }

    const keystone = await get(`/companies/${created[0].id}/full`);
    const keystoneRoles = new Set(keystone.data.contacts.map((contact) => contact.contact_role));
    for (const role of ['owner', 'marketing', 'ops']) {
      assert(keystoneRoles.has(role), `Ready account should include ${role} role`);
    }

    const workNow = (await get(`/prospecting/workbench?view=work_now&q=${stamp}&hide_test_data=true`)).data;
    assert(workNow.hidden_test_records === 0, `Real-style prospect records should not be hidden as test data, got ${workNow.hidden_test_records}`);
    assert(workNow.accounts.length === 3, `Workbench should return the 3 imported prospects, got ${workNow.accounts.length}`);

    const ready = findAccount(workNow, 'Keystone Comfort Systems');
    const roleGap = findAccount(workNow, 'Allegheny Heating and Air');
    const noNextStep = findAccount(workNow, 'Blue Ridge Air Works');
    assert(ready?.status === 'ready_now', `Keystone should be ready_now, got ${ready?.status}`);
    assert(roleGap?.status === 'find_roles', `Allegheny should be find_roles, got ${roleGap?.status}`);
    assert(
      Array.isArray(roleGap?.missing_roles) &&
        roleGap.missing_roles.includes('owner') &&
        roleGap.missing_roles.includes('ops'),
      `Allegheny should flag owner and ops gaps, got ${JSON.stringify(roleGap?.missing_roles)}`,
    );
    assert(noNextStep?.status === 'needs_next_step', `Blue Ridge should need next step, got ${noNextStep?.status}`);

    const readyView = (await get(`/prospecting/workbench?view=ready&q=${stamp}&hide_test_data=true`)).data;
    assert(Boolean(findAccount(readyView, 'Keystone Comfort Systems')), 'Ready view should include Keystone');
    assert(!findAccount(readyView, 'Allegheny Heating and Air'), 'Ready view should exclude role-gap account');

    const roleGapView = (await get(`/prospecting/workbench?view=role_gaps&q=${stamp}&hide_test_data=true`)).data;
    assert(Boolean(findAccount(roleGapView, 'Allegheny Heating and Air')), 'Role-gap view should include Allegheny');
    assert(Boolean(findAccount(roleGapView, 'Blue Ridge Air Works')), 'Role-gap view should include Blue Ridge because marketing is missing');

    const nextStepView = (await get(`/prospecting/workbench?view=needs_next_step&q=${stamp}&hide_test_data=true`)).data;
    assert(Boolean(findAccount(nextStepView, 'Blue Ridge Air Works')), 'No-next-step view should include Blue Ridge');
  } finally {
    for (const company of created.reverse()) {
      await deleteCompany(company.id, company.name);
    }
  }
}

try {
  await smoke();
} catch (err) {
  failures.push(err.message);
}

if (failures.length) {
  console.error('Prospecting readiness smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Prospecting readiness smoke passed.');
console.log(`API: ${apiBase}`);
