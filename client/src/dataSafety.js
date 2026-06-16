import { api } from './api.js';

export function companyDeleteConfirmation(name) {
  return `DELETE ${name}`;
}

export function bulkCompanyDeleteConfirmation(count) {
  return `DELETE ${count} ${count === 1 ? 'COMPANY' : 'COMPANIES'}`;
}

export async function downloadBackupSnapshot() {
  const snapshot = await api.get('/export/snapshot');
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `runwise-crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return snapshot;
}
