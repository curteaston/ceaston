import type {
  Prospect,
  IntakeAnswers,
  EvidenceItem,
  ControlledTest,
  RevenueAssumptions,
  LeakageScorecard,
  LeadFlowMap,
  AuditReport,
  FollowUpTask,
  AppSettings,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import {
  MOCK_PROSPECTS,
  MOCK_INTAKE,
  MOCK_EVIDENCE,
  MOCK_TESTS,
  MOCK_REVENUE,
  MOCK_SCORECARDS,
  MOCK_LEAD_FLOW_MAPS,
  MOCK_REPORTS,
  MOCK_FOLLOW_UPS,
} from '../data/mockData';

const KEYS = {
  PROSPECTS: 'rw_prospects',
  INTAKE: 'rw_intake',
  EVIDENCE: 'rw_evidence',
  TESTS: 'rw_tests',
  REVENUE: 'rw_revenue',
  SCORECARDS: 'rw_scorecards',
  LEAD_FLOW: 'rw_lead_flow',
  REPORTS: 'rw_reports',
  FOLLOW_UPS: 'rw_follow_ups',
  SETTINGS: 'rw_settings',
  INITIALIZED: 'rw_initialized',
};

function get<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function initializeStorage(): void {
  if (localStorage.getItem(KEYS.INITIALIZED)) return;
  set(KEYS.PROSPECTS, MOCK_PROSPECTS);
  set(KEYS.INTAKE, MOCK_INTAKE);
  set(KEYS.EVIDENCE, MOCK_EVIDENCE);
  set(KEYS.TESTS, MOCK_TESTS);
  set(KEYS.REVENUE, MOCK_REVENUE);
  set(KEYS.SCORECARDS, MOCK_SCORECARDS);
  set(KEYS.LEAD_FLOW, MOCK_LEAD_FLOW_MAPS);
  set(KEYS.REPORTS, MOCK_REPORTS);
  set(KEYS.FOLLOW_UPS, MOCK_FOLLOW_UPS);
  set(KEYS.SETTINGS, DEFAULT_SETTINGS);
  localStorage.setItem(KEYS.INITIALIZED, 'true');
}

export function resetStorage(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  initializeStorage();
}

// Prospects
export function getProspects(): Prospect[] {
  return get<Prospect[]>(KEYS.PROSPECTS) ?? [];
}
export function saveProspects(prospects: Prospect[]): void {
  set(KEYS.PROSPECTS, prospects);
}

// Intake
export function getIntake(prospectId: string): IntakeAnswers | null {
  const all = get<Record<string, IntakeAnswers>>(KEYS.INTAKE) ?? {};
  return all[prospectId] ?? null;
}
export function saveIntake(answers: IntakeAnswers): void {
  const all = get<Record<string, IntakeAnswers>>(KEYS.INTAKE) ?? {};
  all[answers.prospectId] = answers;
  set(KEYS.INTAKE, all);
}

// Evidence
export function getEvidence(prospectId: string): EvidenceItem[] {
  const all = get<Record<string, EvidenceItem[]>>(KEYS.EVIDENCE) ?? {};
  return all[prospectId] ?? [];
}
export function saveEvidence(prospectId: string, items: EvidenceItem[]): void {
  const all = get<Record<string, EvidenceItem[]>>(KEYS.EVIDENCE) ?? {};
  all[prospectId] = items;
  set(KEYS.EVIDENCE, all);
}

// Tests
export function getTests(prospectId: string): ControlledTest[] {
  const all = get<Record<string, ControlledTest[]>>(KEYS.TESTS) ?? {};
  return all[prospectId] ?? [];
}
export function saveTests(prospectId: string, tests: ControlledTest[]): void {
  const all = get<Record<string, ControlledTest[]>>(KEYS.TESTS) ?? {};
  all[prospectId] = tests;
  set(KEYS.TESTS, all);
}

// Revenue
export function getRevenue(prospectId: string): RevenueAssumptions | null {
  const all = get<Record<string, RevenueAssumptions>>(KEYS.REVENUE) ?? {};
  return all[prospectId] ?? null;
}
export function saveRevenue(data: RevenueAssumptions): void {
  const all = get<Record<string, RevenueAssumptions>>(KEYS.REVENUE) ?? {};
  all[data.prospectId] = data;
  set(KEYS.REVENUE, all);
}

// Scorecards
export function getScorecard(prospectId: string): LeakageScorecard | null {
  const all = get<Record<string, LeakageScorecard>>(KEYS.SCORECARDS) ?? {};
  return all[prospectId] ?? null;
}
export function saveScorecard(data: LeakageScorecard): void {
  const all = get<Record<string, LeakageScorecard>>(KEYS.SCORECARDS) ?? {};
  all[data.prospectId] = data;
  set(KEYS.SCORECARDS, all);
}

// Lead Flow Maps
export function getLeadFlow(prospectId: string): LeadFlowMap | null {
  const all = get<Record<string, LeadFlowMap>>(KEYS.LEAD_FLOW) ?? {};
  return all[prospectId] ?? null;
}
export function saveLeadFlow(data: LeadFlowMap): void {
  const all = get<Record<string, LeadFlowMap>>(KEYS.LEAD_FLOW) ?? {};
  all[data.prospectId] = data;
  set(KEYS.LEAD_FLOW, all);
}

// Reports
export function getReport(prospectId: string): AuditReport | null {
  const all = get<Record<string, AuditReport>>(KEYS.REPORTS) ?? {};
  return all[prospectId] ?? null;
}
export function saveReport(report: AuditReport): void {
  const all = get<Record<string, AuditReport>>(KEYS.REPORTS) ?? {};
  all[report.prospectId] = report;
  set(KEYS.REPORTS, all);
}
export function getAllReports(): Record<string, AuditReport> {
  return get<Record<string, AuditReport>>(KEYS.REPORTS) ?? {};
}

// Follow-ups
export function getFollowUps(): FollowUpTask[] {
  return get<FollowUpTask[]>(KEYS.FOLLOW_UPS) ?? [];
}
export function saveFollowUps(tasks: FollowUpTask[]): void {
  set(KEYS.FOLLOW_UPS, tasks);
}

// Settings
export function getSettings(): AppSettings {
  return get<AppSettings>(KEYS.SETTINGS) ?? DEFAULT_SETTINGS;
}
export function saveSettings(settings: AppSettings): void {
  set(KEYS.SETTINGS, settings);
}
