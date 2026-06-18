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

async function del(path, bodyOrOptions, maybeOptions) {
  const hasBody = bodyOrOptions && !Object.prototype.hasOwnProperty.call(bodyOrOptions, 'expectOk');
  return request('DELETE', path, hasBody ? bodyOrOptions : undefined, hasBody ? maybeOptions : bodyOrOptions);
}

function hasValues(data, key, values) {
  return Array.isArray(data[key]) && values.every((value) => data[key].includes(value));
}

function companyDeleteConfirmation(name) {
  return `DELETE ${name}`;
}

function bulkCompanyDeleteConfirmation(count) {
  return `DELETE ${count} ${count === 1 ? 'COMPANY' : 'COMPANIES'}`;
}

async function deleteCompany(companyId, companyName, options = {}) {
  return del(`/companies/${companyId}`, { confirm: companyDeleteConfirmation(companyName) }, options);
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
    if (companyId) await deleteCompany(companyId, `Import Smoke Beta ${stamp}`, { expectOk: false });
  }
}

async function smokeImportSanitizesRows() {
  const stamp = Date.now();
  const name = `Import Sanitize ${stamp}`;
  const domain = `import-sanitize-${stamp}.example`;
  let companyId = null;
  try {
    const result = await post('/import', {
      companies: [
        {
          name: '   ',
          domain: `blank-import-${stamp}.example`,
          contacts: [{ name: `Blank Contact ${stamp}`, email: `blank-${stamp}@example.com` }],
        },
        {
          name: `  ${name}  `,
          website: ` https://www.${domain}/about `,
          employee_count: '12 employees',
          lifecycle_stage: 'definitely_not_valid',
          target_tier: 'bad_tier',
          buying_committee_status: 'bad_status',
          contacts: [
            {
              first_name: ' Sam ',
              last_name: ' Owner ',
              email: ` OWNER-${stamp}@EXAMPLE.COM `,
              contact_role: 'not_a_role',
            },
            {
              name: '   ',
              email: `skip-${stamp}@example.com`,
            },
          ],
        },
      ],
    });
    assert(result.data.companies_created === 1, `Sanitized import should create 1 company, got ${result.text}`);
    assert(result.data.contacts_created === 1, `Sanitized import should create 1 contact, got ${result.text}`);
    assert(result.data.skipped?.length === 1, `Sanitized import should skip 1 blank company row, got ${result.text}`);
    assert(result.data.skipped?.[0]?.reason === 'missing company name', `Blank company skip reason was wrong: ${result.text}`);

    const lookup = await get(`/companies/lookup?domain=${encodeURIComponent(domain)}`);
    companyId = lookup.data.id;
    assert(lookup.data.name === name, `Imported company name should be trimmed, got ${lookup.data.name}`);
    assert(lookup.data.employee_count === 12, `Imported employee_count should be coerced to 12, got ${lookup.data.employee_count}`);
    assert(lookup.data.lifecycle_stage === 'lead', `Invalid lifecycle import should fall back to lead, got ${lookup.data.lifecycle_stage}`);
    assert(lookup.data.target_tier == null, `Invalid target_tier import should stay null, got ${lookup.data.target_tier}`);
    assert(
      lookup.data.buying_committee_status === 'unknown',
      `Invalid buying_committee_status should fall back to unknown, got ${lookup.data.buying_committee_status}`,
    );

    const full = await get(`/companies/${companyId}/full`);
    assert(full.data.contacts.length === 1, `Blank contact rows should be skipped, got ${full.data.contacts.length} contacts`);
    const contact = full.data.contacts[0];
    assert(contact.name === 'Sam Owner', `Contact name should be built from trimmed first/last name, got ${contact.name}`);
    assert(contact.email === `owner-${stamp}@example.com`, `Contact email should be trimmed/lowercased, got ${contact.email}`);
    assert(contact.contact_role == null, `Invalid contact_role should stay null, got ${contact.contact_role}`);

    const normalizedUpdate = await post('/import', {
      companies: [{
        name,
        domain,
        lifecycle_stage: 'Customer',
        target_tier: 'Tier 1',
        buying_committee_status: 'Missing Roles',
        contacts: [{
          name: 'Sam Owner',
          email: `owner-${stamp}@example.com`,
          contact_role: 'Office Manager',
        }],
      }],
    });
    assert(normalizedUpdate.data.companies_updated === 1, `Friendly enum re-import should update company, got ${normalizedUpdate.text}`);
    assert(normalizedUpdate.data.contacts_updated === 1, `Friendly enum re-import should update contact, got ${normalizedUpdate.text}`);
    const updatedLookup = await get(`/companies/lookup?domain=${encodeURIComponent(domain)}`);
    assert(updatedLookup.data.lifecycle_stage === 'customer', `Friendly lifecycle should normalize to customer, got ${updatedLookup.data.lifecycle_stage}`);
    assert(updatedLookup.data.target_tier === 'tier_1', `Friendly target_tier should normalize to tier_1, got ${updatedLookup.data.target_tier}`);
    assert(
      updatedLookup.data.buying_committee_status === 'missing_roles',
      `Friendly buying_committee_status should normalize to missing_roles, got ${updatedLookup.data.buying_committee_status}`,
    );
    const updatedFull = await get(`/companies/${companyId}/full`);
    assert(updatedFull.data.contacts[0].contact_role === 'office_manager', `Friendly contact_role should normalize to office_manager, got ${updatedFull.data.contacts[0].contact_role}`);
  } finally {
    if (companyId) await deleteCompany(companyId, name, { expectOk: false });
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
    if (companyId) await deleteCompany(companyId, `Status Constraint Smoke ${stamp}`, { expectOk: false });
  }
}

async function expectBadRequest(label, promise, expectedText) {
  const result = await promise;
  assert(result.res.status === 400, `${label} should return 400, got ${result.res.status}: ${result.text}`);
  if (expectedText) {
    assert(
      typeof result.data?.error === 'string' && result.data.error.includes(expectedText),
      `${label} should mention "${expectedText}", got ${result.text}`,
    );
  }
  return result;
}

async function expectDbCheck(label, sql, params, constraintName) {
  try {
    await dbQuery(sql, params);
    failures.push(`${label}: database allowed invalid data`);
  } catch (err) {
    assert(err.code === '23514', `${label}: expected check constraint error 23514, got ${err.code || err.message}`);
    assert(
      String(err.constraint || err.message).includes(constraintName),
      `${label}: expected constraint ${constraintName}, got ${err.constraint || err.message}`,
    );
  }
}

async function smokeValidationGuardrails() {
  const stamp = Date.now();
  const companyName = `Validation Guardrail ${stamp}`;
  let companyId = null;
  let contactId = null;
  let dealId = null;
  let taskId = null;
  let sequenceId = null;
  try {
    await expectBadRequest(
      'Blank company name',
      post('/companies', { name: '   ', domain: `blank-${stamp}.example` }, { expectOk: false }),
      'name is required',
    );

    const company = await post('/companies', {
      name: companyName,
      domain: `validation-guardrail-${stamp}.example`,
    });
    companyId = company.data.id;

    const contact = await post('/contacts', {
      company_id: companyId,
      name: `Validation Contact ${stamp}`,
      email: `validation-${stamp}@example.com`,
    });
    contactId = contact.data.id;
    const deal = await post('/deals', { company_id: companyId, name: `Validation Deal ${stamp}` });
    dealId = deal.data.id;
    const task = await post('/tasks', { company_id: companyId, description: `Validation Task ${stamp}` });
    taskId = task.data.id;
    const sequence = await post('/sequences', {
      name: `Validation Sequence ${stamp}`,
      steps: [{ kind: 'task', description: 'Valid step', priority: 'medium', task_type: 'call' }],
    });
    sequenceId = sequence.data.id;

    await expectBadRequest(
      'Invalid company lead_status',
      patch(`/companies/${companyId}`, { lead_status: 'bogus' }, { expectOk: false }),
      'lead_status must be one of',
    );
    await expectBadRequest(
      'Blank company lifecycle_stage',
      patch(`/companies/${companyId}`, { lifecycle_stage: '' }, { expectOk: false }),
      'lifecycle_stage cannot be empty',
    );
    await expectBadRequest(
      'Invalid contact role',
      patch(`/contacts/${contactId}`, { contact_role: 'ceo' }, { expectOk: false }),
      'contact_role must be one of',
    );
    await expectBadRequest(
      'Blank contact lead_status',
      patch(`/contacts/${contactId}`, { lead_status: '' }, { expectOk: false }),
      'lead_status cannot be empty',
    );
    await expectBadRequest(
      'Invalid deal probability',
      patch(`/deals/${dealId}`, { probability: 101 }, { expectOk: false }),
      'probability must be a number between 0 and 100',
    );
    await expectBadRequest(
      'Invalid deal stage',
      patch(`/deals/${dealId}`, { stage: 'signed' }, { expectOk: false }),
      'stage must be one of',
    );
    await expectBadRequest(
      'Invalid task priority',
      patch(`/tasks/${taskId}`, { priority: 'urgent' }, { expectOk: false }),
      'priority must be one of',
    );
    await expectBadRequest(
      'Invalid note source',
      post('/notes', { company_id: companyId, body: 'Bad source', source: 'dictated' }, { expectOk: false }),
      'source must be one of',
    );
    await expectBadRequest(
      'Invalid activity type',
      post('/activities', { company_id: companyId, type: 'invalid_type' }, { expectOk: false }),
      'type must be one of',
    );
    await expectBadRequest(
      'Invalid sequence steps shape',
      post('/sequences', { name: `Bad Sequence Shape ${stamp}`, steps: {} }, { expectOk: false }),
      'steps must be an array',
    );
    await expectBadRequest(
      'Invalid sequence step priority',
      post('/sequences', {
        name: `Bad Sequence Priority ${stamp}`,
        steps: [{ kind: 'task', description: 'Bad priority', priority: 'urgent' }],
      }, { expectOk: false }),
      'step.priority must be one of',
    );
    await expectBadRequest(
      'Invalid sequence task_type',
      post('/sequences', {
        name: `Bad Sequence Task Type ${stamp}`,
        steps: [{ kind: 'task', description: 'Bad task type', task_type: 'fax' }],
      }, { expectOk: false }),
      'step.task_type must be one of',
    );

    await expectDbCheck(
      'Company target tier DB guardrail',
      `INSERT INTO companies (name, target_tier) VALUES ($1, 'bogus')`,
      [`DB Bad Company ${stamp}`],
      'companies_target_tier_check',
    );
    await expectDbCheck(
      'Contact role DB guardrail',
      `INSERT INTO contacts (company_id, name, contact_role) VALUES ($1, $2, 'ceo')`,
      [companyId, `DB Bad Contact ${stamp}`],
      'contacts_contact_role_check',
    );
    await expectDbCheck(
      'Deal stage DB guardrail',
      `INSERT INTO deals (company_id, name, stage) VALUES ($1, $2, 'signed')`,
      [companyId, `DB Bad Deal ${stamp}`],
      'deals_stage_check',
    );
    await expectDbCheck(
      'Task priority DB guardrail',
      `INSERT INTO tasks (company_id, description, priority) VALUES ($1, $2, 'urgent')`,
      [companyId, `DB Bad Task ${stamp}`],
      'tasks_priority_check',
    );
    await expectDbCheck(
      'Sequence step priority DB guardrail',
      `INSERT INTO sequence_steps (sequence_id, step_order, day_offset, kind, priority)
       VALUES ($1, 99, 0, 'task', 'urgent')`,
      [sequenceId],
      'sequence_steps_priority_check',
    );
  } finally {
    if (sequenceId) await del(`/sequences/${sequenceId}`, { expectOk: false });
    if (companyId) await deleteCompany(companyId, companyName, { expectOk: false });
  }
}

async function smokeCompanyDeleteConfirmation() {
  const stamp = Date.now();
  const firstName = `Delete Confirmation Smoke ${stamp}`;
  const first = await post('/companies', {
    name: firstName,
    domain: `delete-confirmation-${stamp}.example`,
  });
  const companyId = first.data.id;

  const missing = await del(`/companies/${companyId}`, { expectOk: false });
  assert(missing.res.status === 400, `Company delete without confirmation should return 400, got ${missing.res.status}`);
  const wrong = await del(`/companies/${companyId}`, { confirm: 'DELETE WRONG COMPANY' }, { expectOk: false });
  assert(wrong.res.status === 400, `Company delete with wrong confirmation should return 400, got ${wrong.res.status}`);
  const stillThere = await get(`/companies/${companyId}`);
  assert(stillThere.data.id === companyId, 'Company should remain after missing/wrong delete confirmation');
  const deleted = await deleteCompany(companyId, firstName, { expectOk: false });
  assert(deleted.res.status === 200, `Company delete with exact confirmation should return 200 with audit details, got ${deleted.res.status}`);
  assert(deleted.data?.audit_batch_id, `Company delete should return audit_batch_id, got ${deleted.text}`);

  const bulkNames = [
    `Bulk Delete Confirmation A ${stamp}`,
    `Bulk Delete Confirmation B ${stamp}`,
  ];
  const bulkCompanies = [];
  try {
    for (const [index, name] of bulkNames.entries()) {
      bulkCompanies.push((await post('/companies', {
        name,
        domain: `bulk-delete-confirmation-${stamp}-${index}.example`,
      })).data);
    }
    const ids = bulkCompanies.map((company) => company.id);
    const bulkMissing = await post('/companies/bulk', { ids, action: 'delete' }, { expectOk: false });
    assert(bulkMissing.res.status === 400, `Bulk delete without confirmation should return 400, got ${bulkMissing.res.status}`);
    const bulkWrong = await post('/companies/bulk', { ids, action: 'delete', confirm: 'DELETE WRONG COUNT' }, { expectOk: false });
    assert(bulkWrong.res.status === 400, `Bulk delete with wrong confirmation should return 400, got ${bulkWrong.res.status}`);
    const remaining = await dbQuery('SELECT count(*)::int AS n FROM companies WHERE id = ANY($1::int[])', [ids]);
    assert(remaining.rows[0].n === ids.length, 'Bulk delete should not remove companies without exact confirmation');
    const bulkDeleted = await post('/companies/bulk', {
      ids,
      action: 'delete',
      confirm: bulkCompanyDeleteConfirmation(ids.length),
    });
    assert(bulkDeleted.data.deleted === ids.length, `Bulk delete with exact confirmation should delete ${ids.length}, got ${bulkDeleted.text}`);
    assert(bulkDeleted.data.audit_batch_id, `Bulk delete should return audit_batch_id, got ${bulkDeleted.text}`);
  } finally {
    for (const company of bulkCompanies) {
      await deleteCompany(company.id, company.name, { expectOk: false });
    }
  }
}

async function smokeCompanyArchiveRestore() {
  const stamp = Date.now();
  const name = `Archive Restore Smoke ${stamp}`;
  const domain = `archive-restore-${stamp}.example`;
  let companyId = null;
  let contactId = null;
  let sequenceId = null;
  try {
    const company = await post('/companies', { name, domain });
    companyId = company.data.id;
    const contact = await post('/contacts', {
      company_id: companyId,
      name: `Archive Contact ${stamp}`,
      email: `archive-${stamp}@example.com`,
    });
    contactId = contact.data.id;
    await post('/deals', { company_id: companyId, name: `Archive Deal ${stamp}`, value: 1000 });
    await post('/tasks', { company_id: companyId, description: `Archive Task ${stamp}` });
    await post('/notes', { company_id: companyId, body: `Archive note ${stamp}` });
    await post('/activities', { company_id: companyId, type: 'call', outcome: 'Connected', body: `Archive call ${stamp}` });

    const sequence = await post('/sequences', {
      name: `Archive Sequence ${stamp}`,
      active: true,
      steps: [{ day_offset: 0, kind: 'task', description: `Archive sequence task ${stamp}`, priority: 'low' }],
    });
    sequenceId = sequence.data.id;
    await post(`/sequences/${sequenceId}/enroll`, { company_id: companyId, contact_id: contactId });

    const archived = await post(`/companies/${companyId}/archive`, { reason: 'Smoke archive' });
    assert(Boolean(archived.data.archived_at), 'Archive endpoint should set archived_at');
    assert(archived.data.stopped_enrollments === 1, `Archive should stop 1 active enrollment, got ${archived.text}`);

    const activeList = await get(`/companies?domain=${encodeURIComponent(domain)}`);
    assert(activeList.data.total === 0, `Default companies list should hide archived company, got ${activeList.data.total}`);
    const archivedList = await get(`/companies?archived=true&domain=${encodeURIComponent(domain)}`);
    assert(archivedList.data.total === 1, `Archived companies list should find archived company, got ${archivedList.data.total}`);
    const defaultLookup = await get(`/companies/lookup?domain=${encodeURIComponent(domain)}`, { expectOk: false });
    assert(defaultLookup.res.status === 404, `Default lookup should hide archived company, got ${defaultLookup.res.status}`);
    const archivedLookup = await get(`/companies/lookup?domain=${encodeURIComponent(domain)}&include_archived=true`);
    assert(archivedLookup.data.id === companyId, 'Lookup with include_archived should return archived company');

    const enrollArchived = await post(`/sequences/${sequenceId}/enroll`, { company_id: companyId }, { expectOk: false });
    assert(enrollArchived.res.status === 400, `Archived account enrollment should return 400, got ${enrollArchived.res.status}`);
    const taskArchived = await post('/tasks', { company_id: companyId, description: 'Should fail while archived' }, { expectOk: false });
    assert(taskArchived.res.status === 400, `Archived task creation should return 400, got ${taskArchived.res.status}`);
    const dealArchived = await post('/deals', { company_id: companyId, name: 'Should fail while archived' }, { expectOk: false });
    assert(dealArchived.res.status === 400, `Archived deal creation should return 400, got ${dealArchived.res.status}`);
    const noteArchived = await post('/notes', { company_id: companyId, body: 'Should fail while archived' }, { expectOk: false });
    assert(noteArchived.res.status === 400, `Archived note creation should return 400, got ${noteArchived.res.status}`);
    const activityArchived = await post('/activities', { company_id: companyId, type: 'call' }, { expectOk: false });
    assert(activityArchived.res.status === 400, `Archived activity creation should return 400, got ${activityArchived.res.status}`);
    const contactArchived = await post('/contacts', { company_id: companyId, name: 'Should fail while archived' }, { expectOk: false });
    assert(contactArchived.res.status === 400, `Archived contact creation should return 400, got ${contactArchived.res.status}`);

    const restored = await post(`/companies/${companyId}/restore`);
    assert(restored.data.archived_at == null, 'Restore endpoint should clear archived_at');
    const restoredList = await get(`/companies?domain=${encodeURIComponent(domain)}`);
    assert(restoredList.data.total === 1, `Default companies list should find restored company, got ${restoredList.data.total}`);
  } finally {
    if (sequenceId) await del(`/sequences/${sequenceId}`, { expectOk: false });
    if (companyId) await deleteCompany(companyId, name, { expectOk: false });
  }
}

async function smokeBackupSnapshot() {
  const snapshot = (await get('/export/snapshot')).data;
  assert(snapshot?.schema_version === 'prospecting-v1', 'Backup snapshot schema_version should be prospecting-v1');
  assert(snapshot?.kind === 'prospecting-data-snapshot', `Backup snapshot kind is ${snapshot?.kind || 'missing'}`);
  assert(Date.parse(snapshot?.exported_at), 'Backup snapshot exported_at should be an ISO timestamp');
  assert(Number.isInteger(snapshot?.counts?.companies), 'Backup snapshot missing companies count');
  assert(Number.isInteger(snapshot?.counts?.contacts), 'Backup snapshot missing contacts count');
  assert(Array.isArray(snapshot?.data?.companies), 'Backup snapshot missing companies data');
  assert(Array.isArray(snapshot?.data?.contacts), 'Backup snapshot missing contacts data');
  assert(Array.isArray(snapshot?.data?.activities), 'Backup snapshot missing activities data');
  assert(Array.isArray(snapshot?.data?.sequence_enrollments), 'Backup snapshot missing sequence enrollment data');
  assert(!Object.prototype.hasOwnProperty.call(snapshot?.data || {}, 'app_settings'), 'Backup snapshot should not expose app_settings');
  assert(
    (snapshot?.data?.webhooks || []).every((hook) => !Object.prototype.hasOwnProperty.call(hook, 'secret')),
    'Backup snapshot should not expose webhook secrets',
  );
}

async function smokeContactRequiresCompany() {
  const before = await dbQuery("SELECT count(*)::int AS n FROM companies WHERE name = '(no company)'");
  const attempted = await post('/contacts', {
    name: `Orphan Contact Smoke ${Date.now()}`,
    email: `orphan-${Date.now()}@example.com`,
  }, { expectOk: false });
  assert(attempted.res.status === 400, `Orphan contact creation should return 400, got ${attempted.res.status}`);
  assert(
    typeof attempted.data?.error === 'string' && attempted.data.error.includes('company_id'),
    'Orphan contact creation should return a clear company-required error',
  );
  const after = await dbQuery("SELECT count(*)::int AS n FROM companies WHERE name = '(no company)'");
  assert(
    after.rows[0].n === before.rows[0].n,
    'Orphan contact creation should not create a placeholder "(no company)" account',
  );
}

async function smokeContactTaskTimeline() {
  const stamp = Date.now();
  const companyName = `Task Timeline Smoke ${stamp}`;
  let companyId = null;
  try {
    const company = (await post('/companies', {
      name: companyName,
      domain: `task-timeline-${stamp}.example`,
      industry: 'HVAC',
    })).data;
    companyId = company.id;
    const contact = (await post('/contacts', {
      company_id: companyId,
      name: `Task Contact ${stamp}`,
      email: `task-contact-${stamp}@example.com`,
    })).data;
    const description = `Call owner about RunWise audit ${stamp}`;
    const task = (await post('/tasks', {
      contact_id: contact.id,
      description,
      due_date: '2026-06-30',
      priority: 'high',
      owner: 'Smoke',
    })).data;

    const tasks = (await get(`/tasks?contact_id=${contact.id}`)).data;
    assert(tasks.some((row) => row.id === task.id && row.description === description), 'Contact-created task should appear in /tasks');

    const history = (await get(`/contacts/${contact.id}/history`)).data;
    assert(
      history.some((row) => row.kind === 'task' && row.type === 'task' && row.id === task.id && row.body.includes(description)),
      'Contact-created task should appear in contact history / All activities',
    );

    const full = (await get(`/companies/${companyId}/full`)).data;
    assert(
      full.timeline.some((row) => row.kind === 'task' && row.type === 'task' && row.id === task.id && row.body.includes(description)),
      'Contact-created task should appear in company timeline',
    );
    assert(history.find((row) => row.kind === 'task' && row.id === task.id)?.completed === false, 'New contact task should show as open in contact history');

    await patch(`/tasks/${task.id}`, { completed: true });
    const completedHistory = (await get(`/contacts/${contact.id}/history`)).data;
    const completedTask = completedHistory.find((row) => row.kind === 'task' && row.id === task.id);
    assert(completedTask?.completed === true, 'Completed contact task should show completed in contact history');
    assert(completedTask?.outcome === 'completed', 'Completed contact task should show completed outcome in contact history');

    await del(`/tasks/${task.id}`);
    const deletedTasks = (await get(`/tasks?contact_id=${contact.id}`)).data;
    assert(!deletedTasks.some((row) => row.id === task.id), 'Deleted contact task should disappear from /tasks');
    const deletedHistory = (await get(`/contacts/${contact.id}/history`)).data;
    assert(!deletedHistory.some((row) => row.kind === 'task' && row.id === task.id), 'Deleted contact task should disappear from contact history');

    const noteBody = `Pinned note smoke ${stamp}`;
    const note = (await post('/notes', {
      contact_id: contact.id,
      body: noteBody,
      source: 'typed',
    })).data;
    await patch(`/notes/${note.id}`, { pinned: true });

    const pinnedHistory = (await get(`/contacts/${contact.id}/history`)).data;
    const pinnedContactNote = pinnedHistory.find((row) => row.kind === 'note' && row.id === note.id);
    assert(pinnedContactNote?.pinned === true, 'Pinned contact note should remain pinned after contact history reload');
    assert(pinnedHistory[0]?.kind === 'note' && pinnedHistory[0]?.id === note.id, 'Pinned contact note should sort to the top of contact history');

    const pinnedFull = (await get(`/companies/${companyId}/full`)).data;
    const pinnedCompanyNote = pinnedFull.timeline.find((row) => row.kind === 'note' && row.id === note.id);
    assert(pinnedCompanyNote?.pinned === true, 'Pinned contact note should remain pinned in company timeline');
  } finally {
    if (companyId) await deleteCompany(companyId, companyName, { expectOk: false });
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

  const microsoft = (await get('/integrations/microsoft/status')).data;
  assert(typeof microsoft?.configured === 'boolean', 'Microsoft status should include configured boolean');
  assert(typeof microsoft?.connected === 'boolean', 'Microsoft status should include connected boolean');
  assert(Array.isArray(microsoft?.missing_env), 'Microsoft status should include missing_env array');
  assert(Object.prototype.hasOwnProperty.call(microsoft, 'token_stored'), 'Microsoft status should include token_stored');
  assert(microsoft?.redirect_uri, 'Microsoft status should include redirect_uri');

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
  await smokeImportSanitizesRows();
  await smokeSequenceStatusConstraint();
  await smokeValidationGuardrails();
  await smokeBackupSnapshot();
  await smokeContactRequiresCompany();
  await smokeContactTaskTimeline();
  await smokeCompanyDeleteConfirmation();
  await smokeCompanyArchiveRestore();

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
        assert(cleanup.res.status === 200, `Temporary smoke sequence cleanup returned ${cleanup.res.status}`);
        assert(cleanup.data?.audit_batch_id, `Temporary smoke sequence cleanup should return audit_batch_id, got ${cleanup.text}`);
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
