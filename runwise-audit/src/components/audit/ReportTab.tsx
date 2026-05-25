import React, { useState } from 'react';
import type {
  Prospect, IntakeAnswers, EvidenceItem, ControlledTest,
  RevenueAssumptions, LeakageScorecard, AuditReport, ReportTone,
} from '../../types';
import { Card } from '../layout/Card';
import { Button } from '../layout/Button';
import { Badge } from '../layout/Badge';
import { FormField, Textarea, Select, Input } from '../layout/FormField';
import { saveReport } from '../../utils/storage';
import { generateReportContent } from '../../utils/reportGenerator';

interface ReportTabProps {
  prospect: Prospect;
  intake: IntakeAnswers | null;
  evidence: EvidenceItem[];
  tests: ControlledTest[];
  revenue: RevenueAssumptions | null;
  scorecard: LeakageScorecard | null;
  initialReport: AuditReport | null;
  settings: { defaultReportTone: ReportTone; defaultPilotOfferWording: string };
  onReportUpdate: (r: AuditReport) => void;
}

function emptyReport(prospectId: string, tone: ReportTone): AuditReport {
  return {
    id: `r${Date.now()}`,
    prospectId,
    generatedAt: '',
    tone,
    isDrafted: false,
    findingsCallScheduled: '',
    top3Findings: '',
    biggestVisibilityGap: '',
    strongestRevenuePoint: '',
    recommendedNextStep: '',
    objectionsHeard: '',
    followUpCommitment: '',
    nextMeetingDate: '',
    findingsCallOutcome: '',
    content: '',
  };
}

export function ReportTab({
  prospect, intake, evidence, tests, revenue, scorecard,
  initialReport, settings, onReportUpdate,
}: ReportTabProps) {
  const [report, setReport] = useState<AuditReport>(
    initialReport ?? emptyReport(prospect.id, settings.defaultReportTone)
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const setR = (field: keyof AuditReport, value: any) =>
    setReport((prev) => ({ ...prev, [field]: value }));

  const handleGenerate = () => {
    setGenerating(true);
    const content = generateReportContent(
      prospect, intake, evidence, tests, revenue, scorecard,
      report.tone, settings
    );
    const updated: AuditReport = {
      ...report,
      content,
      generatedAt: new Date().toISOString(),
    };
    setReport(updated);
    saveReport(updated);
    onReportUpdate(updated);
    setTimeout(() => setGenerating(false), 400);
  };

  const handleSave = () => {
    saveReport(report);
    onReportUpdate(report);
  };

  const handleMarkDrafted = () => {
    const updated = { ...report, isDrafted: true };
    setReport(updated);
    saveReport(updated);
    onReportUpdate(updated);
  };

  const handleCopy = () => {
    if (!report.content) return;
    navigator.clipboard.writeText(report.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePrint = () => window.print();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
      {/* Report preview */}
      <div>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Report Tone
              </div>
              <Select value={report.tone} onChange={(e) => setR('tone', e.target.value as ReportTone)}>
                <option>Conservative</option>
                <option>Revenue-Focused</option>
                <option>Boardroom / Professional</option>
              </Select>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? 'Generating...' : report.content ? 'Regenerate' : 'Generate Report'}
              </Button>
              {report.content && (
                <>
                  <Button variant="ghost" onClick={handleCopy}>
                    {copied ? '✓ Copied' : 'Copy Report'}
                  </Button>
                  <Button variant="ghost" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Print
                  </Button>
                  {!report.isDrafted && (
                    <Button variant="secondary" onClick={handleMarkDrafted}>
                      Mark Drafted
                    </Button>
                  )}
                  {report.isDrafted && (
                    <Badge label="Report Drafted" variant="success" />
                  )}
                </>
              )}
            </div>
          </div>
        </Card>

        {!report.content ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>▦</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>No report generated yet</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 400, margin: '0 auto' }}>
                Select a tone and click "Generate Report." The report is built from the data you've entered — intake, evidence, tests, and revenue estimates.
              </div>
              <Button onClick={handleGenerate} style={{ marginTop: 20 }}>
                Generate Report
              </Button>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 0 }}>
            <div style={{
              padding: '20px 24px',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.7,
              color: '#374151',
              whiteSpace: 'pre-wrap',
              background: '#FAFAFA',
              borderRadius: 10,
              overflowX: 'auto',
            }}>
              {report.content}
            </div>
          </Card>
        )}
      </div>

      {/* Findings call sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 14 }}>Findings Call Notes</div>

          <FormField label="Top 3 Findings">
            <Textarea value={report.top3Findings} onChange={(e) => setR('top3Findings', e.target.value)} rows={4} placeholder="1. ...\n2. ...\n3. ..." />
          </FormField>
          <FormField label="Biggest Visibility Gap">
            <Textarea value={report.biggestVisibilityGap} onChange={(e) => setR('biggestVisibilityGap', e.target.value)} rows={2} />
          </FormField>
          <FormField label="Strongest Revenue Point">
            <Textarea value={report.strongestRevenuePoint} onChange={(e) => setR('strongestRevenuePoint', e.target.value)} rows={2} />
          </FormField>
          <FormField label="Recommended Next Step">
            <Textarea value={report.recommendedNextStep} onChange={(e) => setR('recommendedNextStep', e.target.value)} rows={2} />
          </FormField>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 14 }}>Call Scheduling & Outcome</div>

          <FormField label="Findings Call Date">
            <Input type="date" value={report.findingsCallScheduled} onChange={(e) => setR('findingsCallScheduled', e.target.value)} />
          </FormField>
          <FormField label="Objections Heard">
            <Textarea value={report.objectionsHeard} onChange={(e) => setR('objectionsHeard', e.target.value)} rows={2} />
          </FormField>
          <FormField label="Follow-Up Commitment">
            <Textarea value={report.followUpCommitment} onChange={(e) => setR('followUpCommitment', e.target.value)} rows={2} />
          </FormField>
          <FormField label="Next Meeting Date">
            <Input type="date" value={report.nextMeetingDate} onChange={(e) => setR('nextMeetingDate', e.target.value)} />
          </FormField>
          <FormField label="Findings Call Outcome">
            <Select value={report.findingsCallOutcome} onChange={(e) => setR('findingsCallOutcome', e.target.value)}>
              <option value="">— Not yet conducted —</option>
              <option>Proposed</option>
              <option>Won</option>
              <option>Not Now</option>
              <option>Lost</option>
            </Select>
          </FormField>

          <Button onClick={handleSave} style={{ marginTop: 8 }}>Save Notes</Button>
        </Card>

        {report.generatedAt && (
          <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
            Last generated: {new Date(report.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
