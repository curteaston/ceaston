const apiBase = process.env.CRM_API_URL || process.env.CRM_URL || 'http://localhost:3001';
const headers = {
  'Content-Type': 'application/json',
  ...(process.env.API_KEY ? { 'X-Api-Key': process.env.API_KEY } : {}),
};

async function request(method, path, body, { allow404 = false } = {}) {
  const res = await fetch(`${apiBase}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (allow404 && res.status === 404) return { status: res.status, data };
  if (!res.ok) throw new Error(`${method} ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getCompanyByDomain(domain, { allow404 = false } = {}) {
  const result = await request('GET', `/companies/lookup?domain=${encodeURIComponent(domain)}&include_archived=true`, undefined, { allow404 });
  return allow404 && result.status === 404 ? null : result;
}

async function getContact(id) {
  return request('GET', `/contacts/${id}`);
}

function findById(rows, id) {
  return rows.find((row) => Number(row.id) === Number(id));
}

const marker = `${Date.now()}-${process.pid}`;

const importedDomain = `audit-undo-${marker}.example.com`;
const importResult = await request('POST', '/import', {
  companies: [{
    name: `Audit Undo ${marker}`,
    domain: importedDomain,
    source: 'audit smoke',
    contacts: [{
      name: `Audit Contact ${marker}`,
      email: `audit-${marker}@example.com`,
      contact_role: 'marketing',
    }],
  }],
});
assert(importResult.audit_batch_id, 'Import response did not include audit_batch_id');
assert(importResult.companies_created === 1, 'Import smoke expected one created company');
assert(importResult.contacts_created === 1, 'Import smoke expected one created contact');

const importedCompany = await getCompanyByDomain(importedDomain);
assert(importedCompany?.id, 'Imported company was not retrievable before undo');

const undoImport = await request('POST', `/audit/${importResult.audit_batch_id}/undo`, {});
assert(undoImport.events_undone >= 2, 'Import undo did not undo company/contact events');
const missingAfterUndo = await getCompanyByDomain(importedDomain, { allow404: true });
assert(missingAfterUndo === null, 'Imported company still exists after audit undo');

const contacts = await request('GET', '/contacts?limit=100');
let contact = null;
for (const candidate of contacts.contacts || []) {
  if (candidate.do_not_contact || candidate.not_interested || candidate.bad_fit) continue;
  const company = await request('GET', `/companies/${candidate.company_id}`);
  if (company.archived_at || company.do_not_contact || company.not_interested || company.bad_fit) continue;
  contact = candidate;
  break;
}
assert(contact?.id, 'No eligible unsuppressed contact available for audit undo smoke');
const nextStatus = contact.lead_status === 'qualified' ? 'attempted' : 'qualified';
const bulkResult = await request('POST', '/contacts/bulk', {
  ids: [contact.id],
  action: 'update',
  patch: { lead_status: nextStatus },
});
assert(bulkResult.audit_batch_id, 'Contact bulk update did not include audit_batch_id');
const changedContact = await getContact(contact.id);
assert(changedContact.lead_status === nextStatus, 'Contact lead_status did not change before undo');
const undoBulk = await request('POST', `/audit/${bulkResult.audit_batch_id}/undo`, {});
assert(undoBulk.events_undone === 1, 'Contact bulk undo should undo one event');
const restoredContact = await getContact(contact.id);
assert(restoredContact.lead_status === contact.lead_status, 'Contact lead_status was not restored by undo');

const created = await request('POST', '/contacts', {
  company_id: restoredContact.company_id,
  name: `Audit Delete ${marker}`,
  email: `audit-delete-${marker}@example.com`,
});
assert(created.audit_batch_id, 'Contact create did not include audit_batch_id');
const deleted = await request('DELETE', `/contacts/${created.id}`);
assert(deleted.audit_batch_id, 'Contact delete did not include audit_batch_id');
const deletedLookup = await request('GET', `/contacts/${created.id}`, undefined, { allow404: true });
assert(deletedLookup.status === 404, 'Contact delete smoke expected contact to be gone before undo');
const undoDelete = await request('POST', `/audit/${deleted.audit_batch_id}/undo`, {});
assert(undoDelete.events_undone >= 1, 'Contact delete undo did not report undone events');
const restoredDeletedContact = await getContact(created.id);
assert(restoredDeletedContact.email === created.email, 'Deleted contact was not restored by audit undo');
const cleanupCreated = await request('POST', `/audit/${created.audit_batch_id}/undo`, {});
assert(cleanupCreated.events_undone === 1, 'Contact create cleanup undo should remove one restored contact');
const cleanupLookup = await request('GET', `/contacts/${created.id}`, undefined, { allow404: true });
assert(cleanupLookup.status === 404, 'Contact create cleanup undo should remove the restored smoke contact');

const companyId = restoredContact.company_id;

const task = await request('POST', '/tasks', {
  company_id: companyId,
  contact_id: restoredContact.id,
  description: `Audit task ${marker}`,
  priority: 'high',
});
assert(task.audit_batch_id, 'Task create did not include audit_batch_id');
await request('POST', `/audit/${task.audit_batch_id}/undo`, {});
const tasksAfterUndo = await request('GET', `/tasks?company_id=${companyId}`);
assert(!findById(tasksAfterUndo, task.id), 'Task create undo should remove the smoke task');

const deal = await request('POST', '/deals', {
  company_id: companyId,
  name: `Audit deal ${marker}`,
  stage: 'lead',
  probability: 10,
});
assert(deal.audit_batch_id, 'Deal create did not include audit_batch_id');
const dealUpdate = await request('PATCH', `/deals/${deal.id}`, { stage: 'qualified' });
assert(dealUpdate.audit_batch_id, 'Deal update did not include audit_batch_id');
await request('POST', `/audit/${dealUpdate.audit_batch_id}/undo`, {});
const dealsAfterPatchUndo = await request('GET', `/deals?company_id=${companyId}`);
assert(findById(dealsAfterPatchUndo, deal.id)?.stage === 'lead', 'Deal update undo should restore stage');
await request('POST', `/audit/${deal.audit_batch_id}/undo`, {});
const dealsAfterCreateUndo = await request('GET', `/deals?company_id=${companyId}`);
assert(!findById(dealsAfterCreateUndo, deal.id), 'Deal create undo should remove the smoke deal');

const note = await request('POST', '/notes', {
  company_id: companyId,
  contact_id: restoredContact.id,
  body: `Audit note ${marker}`,
});
assert(note.audit_batch_id, 'Note create did not include audit_batch_id');
const notePatch = await request('PATCH', `/notes/${note.id}`, { body: `Audit note updated ${marker}`, pinned: true });
assert(notePatch.audit_batch_id, 'Note update did not include audit_batch_id');
await request('POST', `/audit/${notePatch.audit_batch_id}/undo`, {});
const notesAfterPatchUndo = await request('GET', `/notes?company_id=${companyId}`);
assert(findById(notesAfterPatchUndo, note.id)?.body === note.body, 'Note update undo should restore note body');
const noteDelete = await request('DELETE', `/notes/${note.id}`);
assert(noteDelete.audit_batch_id, 'Note delete did not include audit_batch_id');
await request('POST', `/audit/${noteDelete.audit_batch_id}/undo`, {});
const notesAfterDeleteUndo = await request('GET', `/notes?company_id=${companyId}`);
assert(findById(notesAfterDeleteUndo, note.id)?.body === note.body, 'Note delete undo should restore note');
await request('POST', `/audit/${note.audit_batch_id}/undo`, {});
const notesAfterCreateUndo = await request('GET', `/notes?company_id=${companyId}`);
assert(!findById(notesAfterCreateUndo, note.id), 'Note create undo should remove the smoke note');

const activity = await request('POST', '/activities', {
  company_id: companyId,
  contact_id: restoredContact.id,
  type: 'call',
  outcome: 'left voicemail',
  body: `Audit activity ${marker}`,
});
assert(activity.audit_batch_id, 'Activity create did not include audit_batch_id');
await request('POST', `/audit/${activity.audit_batch_id}/undo`, {});
const activitiesAfterUndo = await request('GET', `/activities?company_id=${companyId}`);
assert(!findById(activitiesAfterUndo, activity.id), 'Activity create undo should remove the smoke activity');

const template = await request('POST', '/email-templates', {
  name: `Audit template ${marker}`,
  category: 'Audit',
  subject: 'Original subject',
  body: 'Original body',
});
assert(template.audit_batch_id, 'Email template create did not include audit_batch_id');
const templatePatch = await request('PATCH', `/email-templates/${template.id}`, {
  name: template.name,
  category: 'Audit',
  subject: 'Updated subject',
  body: 'Updated body',
});
assert(templatePatch.audit_batch_id, 'Email template update did not include audit_batch_id');
await request('POST', `/audit/${templatePatch.audit_batch_id}/undo`, {});
const templatesAfterPatchUndo = await request('GET', '/email-templates');
assert(findById(templatesAfterPatchUndo, template.id)?.subject === template.subject, 'Email template update undo should restore subject');
await request('POST', `/audit/${template.audit_batch_id}/undo`, {});
const templatesAfterCreateUndo = await request('GET', '/email-templates');
assert(!findById(templatesAfterCreateUndo, template.id), 'Email template create undo should remove the smoke template');

const view = await request('POST', '/views', {
  entity: 'company',
  name: `Audit view ${marker}`,
  state: { q: 'original' },
});
assert(view.audit_batch_id, 'Saved view create did not include audit_batch_id');
const viewUpdate = await request('PUT', `/views/${view.id}`, {
  name: `Audit view updated ${marker}`,
  state: { q: 'updated' },
});
assert(viewUpdate.audit_batch_id, 'Saved view update did not include audit_batch_id');
await request('POST', `/audit/${viewUpdate.audit_batch_id}/undo`, {});
const viewsAfterUpdateUndo = await request('GET', '/views?entity=company');
assert(findById(viewsAfterUpdateUndo, view.id)?.name === view.name, 'Saved view update undo should restore name');
await request('POST', `/audit/${view.audit_batch_id}/undo`, {});
const viewsAfterCreateUndo = await request('GET', '/views?entity=company');
assert(!findById(viewsAfterCreateUndo, view.id), 'Saved view create undo should remove the smoke view');

const tag = await request('POST', '/tags', {
  name: `Audit tag ${marker}`,
  color: '#22c55e',
});
assert(tag.audit_batch_id, 'Tag create did not include audit_batch_id');
const companyTag = await request('POST', `/tags/company/${companyId}`, { tag_id: tag.id });
assert(companyTag.audit_batch_id, 'Company tag attach did not include audit_batch_id');
await request('POST', `/audit/${companyTag.audit_batch_id}/undo`, {});
const companyTagsAfterAttachUndo = await request('GET', `/tags/company/${companyId}`);
assert(!findById(companyTagsAfterAttachUndo, tag.id), 'Company tag attach undo should remove tag attachment');
await request('POST', `/audit/${tag.audit_batch_id}/undo`, {});
const tagsAfterCreateUndo = await request('GET', '/tags');
assert(!findById(tagsAfterCreateUndo, tag.id), 'Tag create undo should remove the smoke tag');

const sequence = await request('POST', '/sequences', {
  name: `Audit sequence ${marker}`,
  active: true,
  description: 'Original sequence',
  steps: [{
    day_offset: 0,
    kind: 'task',
    task_type: 'call',
    description: `Audit sequence task ${marker}`,
    priority: 'medium',
  }],
});
assert(sequence.audit_batch_id, 'Sequence create did not include audit_batch_id');
const sequenceUpdate = await request('PUT', `/sequences/${sequence.id}`, {
  name: sequence.name,
  active: true,
  description: 'Updated sequence',
  steps: [{
    day_offset: 0,
    kind: 'task',
    task_type: 'email',
    description: `Audit sequence replacement task ${marker}`,
    priority: 'high',
  }],
});
assert(sequenceUpdate.audit_batch_id, 'Sequence update did not include audit_batch_id');
await request('POST', `/audit/${sequenceUpdate.audit_batch_id}/undo`, {});
const sequenceAfterUpdateUndo = await request('GET', `/sequences/${sequence.id}`);
assert(sequenceAfterUpdateUndo.description === sequence.description, 'Sequence update undo should restore description');
assert(sequenceAfterUpdateUndo.steps?.[0]?.description === sequence.steps[0].description, 'Sequence update undo should restore original step');
const enrollment = await request('POST', `/sequences/${sequence.id}/enroll`, {
  company_id: companyId,
  contact_id: restoredContact.id,
  owner: 'Audit smoke',
});
assert(enrollment.audit_batch_id, 'Sequence enrollment did not include audit_batch_id');
await request('POST', `/audit/${enrollment.audit_batch_id}/undo`, {});
const enrollmentsAfterUndo = await request('GET', `/sequences/enrollments/list?company_id=${companyId}`);
assert(!findById(enrollmentsAfterUndo, enrollment.id), 'Sequence enrollment undo should remove enrollment');
await request('POST', `/audit/${sequence.audit_batch_id}/undo`, {});
const sequenceAfterCreateUndo = await request('GET', `/sequences/${sequence.id}`, undefined, { allow404: true });
assert(sequenceAfterCreateUndo.status === 404, 'Sequence create undo should remove sequence');

console.log('Audit undo smoke passed.');
console.log(`API: ${apiBase}`);
console.log(`Import batch: ${importResult.audit_batch_id}`);
console.log(`Bulk update batch: ${bulkResult.audit_batch_id}`);
console.log(`Delete batch: ${deleted.audit_batch_id}`);
