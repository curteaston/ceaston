export const TARGET_TIER_LABELS = {
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
};

export const BUYING_COMMITTEE_LABELS = {
  unknown: 'Unknown',
  missing_roles: 'Missing roles',
  partial: 'Partial',
  mapped: 'Mapped',
  engaged: 'Engaged',
};

export const CONTACT_ROLE_LABELS = {
  owner: 'Owner',
  gm: 'GM',
  marketing: 'Marketing',
  ops: 'Ops',
  office_manager: 'Office manager',
  dispatcher: 'Dispatcher',
  other: 'Other',
};

export const ROLE_COVERAGE = ['owner', 'marketing', 'ops'];

export const LAST_TOUCH_CHANNELS = ['call', 'email', 'sms', 'meeting', 'linkedin', 'other'];

export function isSuppressed(record) {
  return Boolean(record?.do_not_contact || record?.not_interested || record?.bad_fit);
}

export function suppressionText(record) {
  if (!isSuppressed(record)) return '';
  if (record.suppression_reason) return record.suppression_reason;
  if (record.do_not_contact) return 'Do not contact';
  if (record.not_interested) return 'Not interested';
  if (record.bad_fit) return 'Bad fit';
  return 'Suppressed';
}
