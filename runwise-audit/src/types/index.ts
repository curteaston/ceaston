export type PipelineStage =
  | 'Prospect Identified'
  | 'Intake Scheduled'
  | 'Intake Complete'
  | 'Evidence Requested'
  | 'Evidence Received'
  | 'Test Scheduled'
  | 'Test Complete'
  | 'Report Drafted'
  | 'Findings Call Scheduled'
  | 'Findings Presented'
  | '14-Day Fix Proposed'
  | 'Pilot Won'
  | 'Not Now / Nurture'
  | 'Disqualified';

export const PIPELINE_STAGES: PipelineStage[] = [
  'Prospect Identified',
  'Intake Scheduled',
  'Intake Complete',
  'Evidence Requested',
  'Evidence Received',
  'Test Scheduled',
  'Test Complete',
  'Report Drafted',
  'Findings Call Scheduled',
  'Findings Presented',
  '14-Day Fix Proposed',
  'Pilot Won',
  'Not Now / Nurture',
  'Disqualified',
];

export type LeadSource =
  | 'Google Search Ads'
  | 'Google Local Services Ads'
  | 'Website form'
  | 'Facebook Lead Ads'
  | 'Angi'
  | 'HomeAdvisor'
  | 'Organic website form'
  | 'Phone calls'
  | 'Other';

export const LEAD_SOURCES: LeadSource[] = [
  'Google Search Ads',
  'Google Local Services Ads',
  'Website form',
  'Facebook Lead Ads',
  'Angi',
  'HomeAdvisor',
  'Organic website form',
  'Phone calls',
  'Other',
];

export type AuditStatus = 'not_started' | 'in_progress' | 'complete';

export interface Prospect {
  id: string;
  companyName: string;
  website: string;
  city: string;
  state: string;
  ownerName: string;
  contactTitle: string;
  phone: string;
  email: string;
  estimatedMonthlyGoogleAdsSpend: number;
  estimatedCompanyRevenue: number;
  leadSourcesObserved: LeadSource[];
  notes: string;
  currentStage: PipelineStage;
  nextActionDate: string;
  lastContactedDate: string;
  fitScore: number; // 1-10
  auditStatus: AuditStatus;
  createdAt: string;
}

export interface IntakeAnswers {
  prospectId: string;
  paidLeadSources: string;
  formEmailLeadDestination: string;
  whoResponds: string;
  afterHoursProcess: string;
  tracksMissedCallsAndResponseTime: string;
  permissionToTest: string;
  normalBusinessHours: string;
  afterHoursDetail: string;
  leadFollowUpOwner: string;
  bookingSystem: string;
  responseTimeTrackingMethod: string;
  missedCallTrackingMethod: string;
  knownPainPoints: string;
  permissionNormalHoursTest: boolean | null;
  permissionAfterHoursTest: boolean | null;
  permissionNotes: string;
  completedAt: string;
}

export type EvidenceStatus = 'Requested' | 'Received' | 'Not Available' | 'Not Needed';

export interface EvidenceItem {
  id: string;
  prospectId: string;
  type:
    | 'Recent lead emails (2-3)'
    | 'Missed call screenshot'
    | 'Google LSA screenshot'
    | 'Facebook lead screenshot'
    | 'Angi/HomeAdvisor screenshot'
    | 'Permission to test website form'
    | 'Permission to test after-hours form'
    | 'Dispatcher/CSR process notes';
  status: EvidenceStatus;
  link: string;
  notes: string;
  dateReceived: string;
  visibilityGap: boolean;
}

export type TestType =
  | 'Normal-hours website form'
  | 'After-hours website form'
  | 'Aggregator/email routing test'
  | 'Other';

export type TestOutcome = 'Strong' | 'Moderate' | 'Weak' | 'Critical leak' | 'Inconclusive';

export interface ControlledTest {
  id: string;
  prospectId: string;
  testType: TestType;
  testDate: string;
  testTime: string;
  leadSourceTested: string;
  testNameUsed: string;
  testPhoneEmail: string;
  responseReceived: boolean | null;
  timeToFirstResponse: string;
  responseMethod: 'Call' | 'Text' | 'Email' | 'None' | '';
  callAnswered: boolean | null;
  voicemailLeft: boolean | null;
  bookingAttempted: boolean | null;
  followUpReceived: boolean | null;
  notes: string;
  screenshotLink: string;
  outcome: TestOutcome | '';
}

export type LeakGap =
  | 'Delay gap'
  | 'After-hours gap'
  | 'Missed-call gap'
  | 'No follow-up gap'
  | 'No visibility/reporting gap'
  | 'Manual handoff gap'
  | 'No booking confirmation gap';

export const LEAK_GAPS: LeakGap[] = [
  'Delay gap',
  'After-hours gap',
  'Missed-call gap',
  'No follow-up gap',
  'No visibility/reporting gap',
  'Manual handoff gap',
  'No booking confirmation gap',
];

export interface LeadFlowNode {
  id: string;
  label: string;
  gaps: LeakGap[];
}

export interface LeadFlowMap {
  prospectId: string;
  nodes: LeadFlowNode[];
  notes: string;
}

export interface RevenueAssumptions {
  prospectId: string;
  estimatedMonthlyGoogleAdsSpend: number;
  averageCPL: number;
  estimatedTotalPaidLeads: number;
  formEmailLeadPercentage: number;
  estimatedMonthlyFormEmailLeads: number;
  currentFormToAppointmentRate: number;
  improvedFormToAppointmentRate: number;
  appointmentToCloseRate: number;
  averageTicket: number;
  conservativeRecoveryPercentage: number;
}

export type ScorecardCategory =
  | 'Speed to first response'
  | 'After-hours coverage'
  | 'Missed call handling'
  | 'Form/email lead handling'
  | 'Booking process clarity'
  | 'Owner visibility/reporting'
  | 'Follow-up consistency';

export const SCORECARD_CATEGORIES: ScorecardCategory[] = [
  'Speed to first response',
  'After-hours coverage',
  'Missed call handling',
  'Form/email lead handling',
  'Booking process clarity',
  'Owner visibility/reporting',
  'Follow-up consistency',
];

export interface LeakageScorecard {
  prospectId: string;
  scores: Record<ScorecardCategory, number>; // 0-3 each
  notes: string;
}

export type ReportTone = 'Conservative' | 'Revenue-Focused' | 'Boardroom / Professional';

export interface AuditReport {
  id: string;
  prospectId: string;
  generatedAt: string;
  tone: ReportTone;
  isDrafted: boolean;
  findingsCallScheduled: string;
  top3Findings: string;
  biggestVisibilityGap: string;
  strongestRevenuePoint: string;
  recommendedNextStep: string;
  objectionsHeard: string;
  followUpCommitment: string;
  nextMeetingDate: string;
  findingsCallOutcome: 'Proposed' | 'Won' | 'Not Now' | 'Lost' | '';
  content: string;
}

export interface FollowUpTask {
  id: string;
  prospectId: string;
  prospectName: string;
  stage: PipelineStage;
  action: string;
  dueDate: string;
  notes: string;
  completed: boolean;
  createdAt: string;
}

export interface AppSettings {
  defaultAverageCPL: number;
  defaultFormEmailLeadPercentage: number;
  defaultCurrentAppointmentRate: number;
  defaultImprovedAppointmentRate: number;
  defaultCloseRate: number;
  defaultAverageTicket: number;
  defaultRecoveryPercentage: number;
  defaultReportTone: ReportTone;
  defaultPilotOfferWording: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultAverageCPL: 104,
  defaultFormEmailLeadPercentage: 45,
  defaultCurrentAppointmentRate: 20,
  defaultImprovedAppointmentRate: 35,
  defaultCloseRate: 30,
  defaultAverageTicket: 800,
  defaultRecoveryPercentage: 70,
  defaultReportTone: 'Conservative',
  defaultPilotOfferWording:
    'In 14 days, RunWise installs a working speed-to-lead system that contacts new HVAC leads quickly, attempts to qualify and book them, logs outcomes, and gives the owner visibility into what happened.',
};
