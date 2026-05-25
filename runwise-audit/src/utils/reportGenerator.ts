import type {
  Prospect,
  IntakeAnswers,
  EvidenceItem,
  ControlledTest,
  RevenueAssumptions,
  LeakageScorecard,
  ReportTone,
  SCORECARD_CATEGORIES,
} from '../types';
import { computeRevenue } from './revenueCalc';

function scoreLabel(total: number): string {
  if (total <= 6) return 'Low';
  if (total <= 12) return 'Moderate';
  if (total <= 17) return 'High';
  return 'Critical';
}

function toneIntro(tone: ReportTone, company: string): string {
  switch (tone) {
    case 'Revenue-Focused':
      return `This audit evaluates the paid lead handling process at ${company} with a specific focus on identifying revenue exposure created by response gaps, after-hours coverage failures, and lead routing breakdowns.`;
    case 'Boardroom / Professional':
      return `This audit presents a structured operational assessment of lead management efficiency at ${company}, including evidence review, controlled testing outcomes, and directional revenue modeling.`;
    default:
      return `This audit documents the available evidence regarding paid lead handling at ${company}. Findings are based on information provided by the business, screenshots and data shared during the audit, and limited controlled tests conducted with permission.`;
  }
}

function testSummaryLine(test: ControlledTest): string {
  const resp = test.responseReceived
    ? `Response received in ${test.timeToFirstResponse} via ${test.responseMethod}.`
    : `No response received (${test.timeToFirstResponse}).`;
  const booking = test.bookingAttempted ? 'Booking was attempted.' : 'No booking attempted.';
  const followUp = test.followUpReceived ? 'Follow-up received.' : 'No follow-up received.';
  return `[${test.testType} — ${test.testDate} ${test.testTime}] ${resp} ${booking} ${followUp} Outcome: ${test.outcome || 'Inconclusive'}.`;
}

function evidenceSummary(items: EvidenceItem[]): string {
  const received = items.filter((e) => e.status === 'Received');
  const gaps = items.filter((e) => e.visibilityGap);
  const lines: string[] = [];
  received.forEach((e) => lines.push(`- ${e.type}: Received. ${e.notes}`));
  gaps.forEach((e) => {
    if (e.status !== 'Received') lines.push(`- ${e.type}: Not available — visibility gap identified.`);
  });
  return lines.join('\n') || 'No evidence items documented.';
}

function gapsList(scorecard: LeakageScorecard): string {
  const categories = Object.keys(scorecard.scores) as (keyof typeof scorecard.scores)[];
  return categories
    .filter((c) => scorecard.scores[c] <= 1)
    .map((c) => `- ${c}: Score ${scorecard.scores[c]}/3 — significant gap identified`)
    .join('\n') || '- No critical gaps identified based on available data.';
}

export function generateReportContent(
  prospect: Prospect,
  intake: IntakeAnswers | null,
  evidence: EvidenceItem[],
  tests: ControlledTest[],
  revenue: RevenueAssumptions | null,
  scorecard: LeakageScorecard | null,
  tone: ReportTone,
  settings: { defaultPilotOfferWording: string }
): string {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const rev = revenue ? computeRevenue(revenue) : null;
  const totalScore = scorecard
    ? Object.values(scorecard.scores).reduce((a, b) => a + b, 0)
    : null;
  const severity = totalScore !== null ? scoreLabel(totalScore) : 'Unknown';

  const visGaps = evidence.filter((e) => e.visibilityGap);
  const criticalTests = tests.filter((t) => t.outcome === 'Critical leak' || t.outcome === 'Weak');

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
48-HOUR PAID LEAD LEAK AUDIT
Prepared by RunWise Systems  |  ${date}
Internal Use Only — Not for Distribution
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPANY REVIEWED
${prospect.companyName}
${prospect.city}, ${prospect.state}
Contact: ${prospect.ownerName}${prospect.contactTitle ? ', ' + prospect.contactTitle : ''}
Estimated Monthly Google Ads Spend: $${prospect.estimatedMonthlyGoogleAdsSpend?.toLocaleString() ?? 'Unknown'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AUDIT SCOPE
${toneIntro(tone, prospect.companyName)}

Lead sources reviewed: ${prospect.leadSourcesObserved.join(', ') || 'Not documented'}
Evidence items collected: ${evidence.filter((e) => e.status === 'Received').length} of ${evidence.length}
Controlled tests run: ${tests.length}
Visibility gaps identified: ${visGaps.length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTIVE SUMMARY
Based on the available evidence, ${prospect.companyName} has identifiable gaps in its paid lead handling process. The available evidence suggests that a portion of leads generated through paid channels are not being reached within a competitive response window, and in some cases are receiving no response at all.

Leakage severity: ${severity}${totalScore !== null ? ` (Score: ${totalScore}/21)` : ''}

This report does not evaluate website design, SEO performance, or ad campaign quality. The focus is limited to what happens to leads after they are generated.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CURRENT LEAD FLOW
${intake ? `Lead sources: ${intake.paidLeadSources}
Form/email destination: ${intake.formEmailLeadDestination}
Who responds: ${intake.whoResponds}
After-hours process: ${intake.afterHoursProcess}
Response time tracking: ${intake.responseTimeTrackingMethod || 'None documented'}
Missed call tracking: ${intake.missedCallTrackingMethod || 'None documented'}` : 'Intake data not yet collected.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EVIDENCE REVIEWED
${evidenceSummary(evidence)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTROLLED TEST RESULTS
${tests.length > 0
  ? tests.map(testSummaryLine).join('\n')
  : 'No controlled tests have been conducted.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY LEAKAGE FINDINGS
${scorecard ? gapsList(scorecard) : 'Scorecard not yet completed.'}

${criticalTests.length > 0 ? `Controlled test failures:
${criticalTests.map((t) => `- ${t.testType} on ${t.testDate}: ${t.outcome}`).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VISIBILITY GAPS
${visGaps.length > 0
  ? visGaps.map((g) => `- ${g.type}: ${g.notes || 'Visibility gap — no data available.'}`).join('\n')
  : 'No visibility gaps identified based on available evidence.'}

Note: Where evidence was not available, the absence of data is itself a visibility gap. RunWise does not speculate beyond available evidence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIRECTIONAL REVENUE EXPOSURE ESTIMATE
${rev ? `These are directional estimates, not guaranteed savings. Actual results depend on lead quality, business operations, and local market conditions.

Estimated monthly paid leads: ${rev.estimatedPaidLeads}
Estimated monthly form/email leads: ${rev.estimatedFormEmailLeads}
Current booked appointments (form/email): ${rev.currentAppointments}
Projected booked appointments with RunWise: ${rev.projectedAppointments}
Additional appointments per month: ${rev.additionalAppointments}
Additional closed jobs per month: ${rev.additionalClosedJobs}
Estimated monthly revenue exposure: $${rev.monthlyRevenueExposure.toLocaleString()}
Estimated annual revenue exposure: $${rev.annualRevenueExposure.toLocaleString()}

All numbers are directional estimates based on industry benchmarks and information provided by the business. They are not guarantees.` : 'Revenue estimate not yet completed.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDED FIX
14-Day Speed-to-Lead Fix

${settings.defaultPilotOfferWording}

What this is NOT:
- Not a full CRM rebuild
- Not a website redesign
- Not ad management
- Not a call center replacement
- Not a broad AI transformation project

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROPOSED NEXT STEP
Schedule a 30-minute findings call to walk through this report together, confirm the findings reflect reality, and explore whether the 14-Day Speed-to-Lead Fix is the right next step.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prepared by RunWise Systems — Internal Use Only
`.trim();
}
