import React from 'react';
import type { Prospect, AuditReport } from '../../types';
import { Header } from '../layout/Header';
import { Card } from '../layout/Card';
import { Badge } from '../layout/Badge';
import { Button } from '../layout/Button';

interface ReportsPageProps {
  prospects: Prospect[];
  reports: Record<string, AuditReport>;
  onOpenProspect: (id: string) => void;
}

export function ReportsPage({ prospects, reports, onOpenProspect }: ReportsPageProps) {
  const reportList = Object.values(reports).map((r) => ({
    report: r,
    prospect: prospects.find((p) => p.id === r.prospectId),
  })).filter((x) => x.prospect);

  const drafted = reportList.filter((x) => x.report.isDrafted);
  const pending = reportList.filter((x) => !x.report.isDrafted);
  const withFindings = reportList.filter((x) => x.report.findingsCallScheduled);

  return (
    <div>
      <Header
        title="Reports"
        subtitle={`${reportList.length} report${reportList.length !== 1 ? 's' : ''} — ${drafted.length} drafted`}
      />

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            Reports Drafted
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{drafted.length}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            Findings Calls Scheduled
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#7C3AED' }}>{withFindings.length}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
            Reports Pending
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#D97706' }}>{pending.length}</div>
        </Card>
      </div>

      {reportList.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>▦</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>No reports yet</div>
            <div style={{ fontSize: 13 }}>
              Open a prospect's Audit Workspace and go to the Report Writer tab to generate a report.
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reportList
            .sort((a, b) => new Date(b.report.generatedAt || 0).getTime() - new Date(a.report.generatedAt || 0).getTime())
            .map(({ report, prospect }) => (
              <Card key={report.id} style={{
                padding: 0, overflow: 'hidden',
                borderLeft: `4px solid ${report.isDrafted ? '#059669' : '#F4C95D'}`,
              }}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>
                          {prospect!.companyName}
                        </span>
                        <Badge label={report.isDrafted ? 'Drafted' : 'In Progress'} variant={report.isDrafted ? 'success' : 'warning'} />
                        <Badge label={report.tone} variant="neutral" />
                        {report.findingsCallOutcome && (
                          <Badge
                            label={report.findingsCallOutcome}
                            variant={
                              report.findingsCallOutcome === 'Won' ? 'success' :
                              report.findingsCallOutcome === 'Lost' ? 'danger' :
                              report.findingsCallOutcome === 'Not Now' ? 'neutral' : 'info'
                            }
                          />
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>
                        {prospect!.city}, {prospect!.state} · {prospect!.ownerName}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => onOpenProspect(prospect!.id)}>
                      Open Workspace
                    </Button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 14, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
                    {report.top3Findings && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>Top 3 Findings</div>
                        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{report.top3Findings}</div>
                      </div>
                    )}
                    {report.biggestVisibilityGap && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>Biggest Gap</div>
                        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{report.biggestVisibilityGap}</div>
                      </div>
                    )}
                    {report.findingsCallScheduled && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>Findings Call</div>
                        <div style={{ fontSize: 12, color: '#374151' }}>
                          {new Date(report.findingsCallScheduled + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    )}
                  </div>

                  {report.generatedAt && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>
                      Generated: {new Date(report.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
