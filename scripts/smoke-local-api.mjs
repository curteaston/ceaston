const apiBase = process.env.CRM_API_URL || `http://localhost:${process.env.LOCAL_CRM_API_PORT || 3001}`;

const headers = {
  'Content-Type': 'application/json',
  ...(process.env.API_KEY ? { 'X-Api-Key': process.env.API_KEY } : {}),
};

const failures = [];
const warnings = [];

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

async function get(path, options) {
  return request('GET', path, undefined, options);
}

async function post(path, body, options) {
  return request('POST', path, body, options);
}

async function patch(path, body, options) {
  return request('PATCH', path, body, options);
}

async function del(path, options) {
  return request('DELETE', path, undefined, options);
}

function hasValues(data, key, values) {
  return Array.isArray(data[key]) && values.every((value) => data[key].includes(value));
}

let dbModule;
async function dbQuery(text, params) {
  process.env.DATABASE_URL ||= `postgres://${process.env.LOCAL_CRM_DBUSER || 'crm'}@127.0.0.1:${process.env.LOCAL_CRM_PGPORT || '55432'}/${process.env.LOCAL_CRM_DB || 'hvac_crm'}`;
  dbModule ||= await import('../server/src/db.js');
  return dbModule.query(text, params);
}

async function closeDbPool() {
  if (dbModule?.pool) await dbModule.pool.end();
}

async function smokeImportDomainIdentity() {
  const stamp = Date.now();
  const domain = `import-smoke-${stamp}.example`;
  let companyId = null;
  try {
    const first = await post('/import', {
      companies: [{
        name: `Import Smoke Alpha ${stamp}`,
        website: `https://www.${domain}/contact`,
        contacts: [{ name: 'Import Smoke Owner', email: `owner@${domain}` }],
      }],
    });
    assert(first.data.companies_created === 1, `First domain import should create 1 company, got ${first.text}`);

    const second = await post('/import', {
      companies: [{
        name: `Import Smoke Beta ${stamp}`,
        domain: `www.${domain}`,
        contacts: [{ name: 'Import Smoke Owner', email: `owner@${domain}`, title: 'Owner' }],
      }],
    });
    assert(second.data.companies_updated === 1, `Second domain import should update existing company, got ${second.text}`);
    assert(second.data.companies_created === 0, `Second domain import should not create a duplicate, got ${second.text}`);

    const lookup = await get(`/companies/lookup?domain=${encodeURIComponent(`https://www.${domain}/services`)}`);
    companyId = lookup.data.id;
    assert(lookup.data.domain === domain, `Lookup should return normalized domain ${domain}, got ${lookup.data.domain}`);
    assert(lookup.data.name === `Import Smoke Beta ${stamp}`, 'Domain-matched re-import should update the existing company name');

    const listed = await get(`/companies?domain=${encodeURIComponent(domain)}`);
    assert(listed.data.total === 1, `Domain search should find exactly 1 smoke company, got ${listed.data.total}`);
  } finally {
    if (companyId) await del(`/companies/${companyId}`, { expectOk: false });
  }
}

async function smokeSequenceStatusConstraint() {
  const stamp = Date.now();
  let companyId = null;
  let sequenceId = null;
  try {
    const company = await post('/companies', {
      name: `Status Constraint Smoke ${stamp}`,
      domain: `status-constraint-${stamp}.example`,
    });
    companyId = company.data.id;
    const sequence = await post('/sequences', {
      name: `Status Constraint Smoke ${stamp}`,
      steps: [{ day_offset: 0, kind: 'task', description: 'Status constraint smoke' }],
    });
    sequenceId = sequence.data.id;

    try {
      await dbQuery(
        `INSERT INTO sequence_enrollments (sequence_id, company_id, status)
         VALUES ($1, $2, 'bogus')`,
        [sequenceId, companyId],
      );
      failures.push('Database allowed invalid sequence enrollment status "bogus"');
    } catch (err) {
      assert(
        /sequence_enrollments_status_check|violates check constraint/.test(err.message),
        `Invalid enrollment status failed for the wrong reason: ${err.message}`,
      );
    }
  } finally {
    if (sequenceId) await del(`/sequences/${sequenceId}`, { expectOk: false });
    if (companyId) await del(`/companies/${companyId}`, { expectOk: false });
  }
}

async function smoke() {
  const health = (await get('/health')).data;
  assert(health?.ok === true, 'API health did not return ok=true');
  assert(health?.schema_version === 'prospecting-v1', `API health schema_version is ${health?.schema_version || 'missing'}`);

  const meta = (await get('/meta')).data;
  assert(meta?.schema_version === 'prospecting-v1', `API meta schema_version is ${meta?.schema_version || 'missing'}`);
  assert(hasValues(meta, 'target_tiers', ['tier_1', 'tier_2', 'tier_3']), 'API meta target_tiers is missing expected values');
  assert(
    hasValues(meta, 'buying_committee_statuses', ['unknown', 'missing_roles', 'partial', 'mapped', 'engaged']),
    'API meta buying_committee_statuses is missing expected values',
  );
  assert(
    hasValues(meta, 'contact_roles', ['owner', 'marketing', 'ops', 'office_manager']),
    'API meta contact_roles is missing expected prospecting roles',
  );

  const list = (await get('/companies?limit=1')).data;
  assert(Number.isInteger(list?.total), 'Companies list did not include integer total');
  assert(Array.isArray(list?.companies), 'Companies list did not include companies array');
  assert(
    (list?.companies || []).length > 0,
    'No companies found. Run npm run dev:local to start and seed an empty local database.',
  );

  if ((list?.companies || []).length > 0) {
    const companyId = list.companies[0].id;
    const full = (await get(`/companies/${companyId}/full`)).data;
    assert(full?.id === companyId, 'Full company payload did not return the requested company');
    assert(Array.isArray(full?.contacts), 'Full company payload missing contacts array');
    assert(Array.isArray(full?.deals), 'Full company payload missing deals array');
    assert(Array.isArray(full?.tasks), 'Full company payload missing tasks array');
    assert(Array.isArray(full?.timeline), 'Full company payload missing timeline array');
    assert(Array.isArray(full?.tags), 'Full company payload missing tags array');
    assert(Object.prototype.hasOwnProperty.call(full, 'target_tier'), 'Full company payload missing target_tier');
    assert(Object.prototype.hasOwnProperty.call(full, 'buying_committee_status'), 'Full company payload missing buying_committee_status');
    assert(Object.prototype.hasOwnProperty.call(full, 'next_step'), 'Full company payload missing next_step');

    const invalidTier = await patch(`/companies/${companyId}`, { target_tier: 'definitely_not_a_tier' }, { expectOk: false });
    assert(invalidTier.res.status === 400, `Invalid target_tier should return 400, got ${invalidTier.res.status}`);
  }

  await smokeImportDomainIdentity();
  await smokeSequenceStatusConstraint();

  const arctic = await get('/companies/lookup?domain=arcticairsolutions.com', { expectOk: false });
  if (arctic.res.ok) {
    const data = arctic.data;
    const roles = new Set((data.contacts || []).map((contact) => contact.contact_role));
    assert(data.target_tier === 'tier_1', 'Seeded Arctic company should be tier_1');
    assert(data.buying_committee_status === 'partial', 'Seeded Arctic company should have partial buying committee status');
    assert(Boolean(data.next_step), 'Seeded Arctic company should have a next_step');
    assert(roles.has('owner'), 'Seeded Arctic company should include an owner contact role');
    assert(roles.has('office_manager'), 'Seeded Arctic company should include an office_manager contact role');
    assert((data.deals || []).some((deal) => deal.name === 'Arctic Air - PPC management'), 'Seeded Arctic deal was not found');
  } else {
    warnings.push('Seeded Arctic demo company not found; skipped seeded prospecting assertions.');
  }

  const blueFlame = await get('/companies/lookup?domain=blueflameheat.com', { expectOk: false });
  if (blueFlame.res.ok) {
    const data = blueFlame.data;
    assert(data.do_not_contact === true, 'Seeded Blue Flame company should be do_not_contact');
    assert(data.not_interested === true, 'Seeded Blue Flame company should be not_interested');
    assert(
      (data.contacts || []).some((contact) => contact.do_not_contact === true && contact.not_interested === true),
      'Seeded Blue Flame contact should be suppressed',
    );

    let sequenceId = null;
    try {
      const seq = await post('/sequences', {
        name: `Smoke suppression guard ${Date.now()}`,
        active: true,
        steps: [{ day_offset: 0, kind: 'task', description: 'Smoke test task', priority: 'low' }],
      });
      sequenceId = seq.data.id;
      const enroll = await post(`/sequences/${sequenceId}/enroll`, { company_id: data.id }, { expectOk: false });
      assert(enroll.res.status === 400, `Suppressed account enrollment should return 400, got ${enroll.res.status}`);
      assert(
        typeof enroll.data?.error === 'string' && enroll.data.error.includes('Cannot enroll suppressed account'),
        'Suppressed account enrollment should return a clear guardrail error',
      );
    } finally {
      if (sequenceId) {
        const cleanup = await del(`/sequences/${sequenceId}`, { expectOk: false });
        assert(cleanup.res.status === 204, `Temporary smoke sequence cleanup returned ${cleanup.res.status}`);
      }
    }
  } else {
    warnings.push('Seeded Blue Flame demo company not found; skipped suppression guardrail assertions.');
  }
}

try {
  await smoke();
} catch (err) {
  failures.push(err.message);
} finally {
  await closeDbPool();
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);

if (failures.length) {
  console.error('Local API smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Local API smoke passed.');
console.log(`API: ${apiBase}`);
