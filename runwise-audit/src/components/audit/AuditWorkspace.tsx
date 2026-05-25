import React, { useState } from 'react';
import type { Prospect, AuditReport, AppSettings } from '../../types';
import { StageBadge, AuditStatusBadge } from '../layout/Badge';
import { Button } from '../layout/Button';
import { OverviewTab } from './OverviewTab';
import { IntakeTab } from './IntakeTab';
import { EvidenceTab } from './EvidenceTab';
import { TestsTab } from './TestsTab';
import { LeadFlowTab } from './LeadFlowTab';
import { RevenueTab } from './RevenueTab';
import { ReportTab } from './ReportTab';
import { FollowUpNotesTab } from './FollowUpNotesTab';
import {
  getIntake, getEvidence, getTests, getRevenue,
  getScorecard, getLeadFlow, getReport,
} from '../../utils/storage';

type TabId = 'overview' | 'intake' | 'evidence' | 'tests' | 'leadflow' | 'revenue' | 'report' | 'followups';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'intake', label: 'Intake' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'tests', label: 'Controlled Tests' },
  { id: 'leadflow', label: 'Lead-Flow Map' },
  { id: 'revenue', label: 'Revenue Estimate' },
  { id: 'report', label: 'Report Writer' },
  { id: 'followups', label: 'Follow-Up Notes' },
];

interface AuditWorkspaceProps {
  prospect: Prospect;
  onProspectUpdate: (p: Prospect) => void;
  onBack: () => void;
  settings: AppSettings;
}

export function AuditWorkspace({ prospect: initialProspect, onProspectUpdate, onBack, settings }: AuditWorkspaceProps) {
  const [prospect, setProspect] = useState(initialProspect);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [currentReport, setCurrentReport] = useState<AuditReport | null>(getReport(initialProspect.id));

  const handleProspectUpdate = (p: Prospect) => {
    setProspect(p);
    onProspectUpdate(p);
  };

  const handleReportUpdate = (r: AuditReport) => {
    setCurrentReport(r);
  };

  return (
    <div>
      {/* Breadcrumb header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#2F3C7E', fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
              padding: 0,
            }}
          >
            ← Prospects
          </button>
          <span style={{ color: '#D1D5DB' }}>/</span>
          <span style={{ fontSize: 13, color: '#374151' }}>{prospect.companyName}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#2F3C7E' }}>
              {prospect.companyName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <StageBadge stage={prospect.currentStage} />
              <AuditStatusBadge status={prospect.auditStatus} />
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                {prospect.city}, {prospect.state} · {prospect.ownerName}
              </span>
              {prospect.estimatedMonthlyGoogleAdsSpend > 0 && (
                <span style={{ fontSize: 12, color: '#6B7280' }}>
                  · ${prospect.estimatedMonthlyGoogleAdsSpend.toLocaleString()}/mo ads
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '2px solid #E5E7EB',
        marginBottom: 24, overflowX: 'auto',
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 16px', fontSize: 13, fontFamily: 'inherit',
                fontWeight: isActive ? 700 : 400, cursor: 'pointer',
                background: 'none', border: 'none',
                borderBottom: `2px solid ${isActive ? '#2F3C7E' : 'transparent'}`,
                color: isActive ? '#2F3C7E' : '#6B7280',
                marginBottom: -2, whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
              {tab.id === 'report' && currentReport?.isDrafted && (
                <span style={{
                  marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  background: '#D1FAE5', color: '#065F46', fontWeight: 700,
                }}>
                  DRAFTED
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab prospect={prospect} onUpdate={handleProspectUpdate} />
      )}
      {activeTab === 'intake' && (
        <IntakeTab prospectId={prospect.id} initial={getIntake(prospect.id)} />
      )}
      {activeTab === 'evidence' && (
        <EvidenceTab prospectId={prospect.id} initial={getEvidence(prospect.id)} />
      )}
      {activeTab === 'tests' && (
        <TestsTab prospectId={prospect.id} initial={getTests(prospect.id)} />
      )}
      {activeTab === 'leadflow' && (
        <LeadFlowTab prospectId={prospect.id} initial={getLeadFlow(prospect.id)} />
      )}
      {activeTab === 'revenue' && (
        <RevenueTab
          prospectId={prospect.id}
          prospectAdSpend={prospect.estimatedMonthlyGoogleAdsSpend}
          initialRevenue={getRevenue(prospect.id)}
          initialScorecard={getScorecard(prospect.id)}
          defaultSettings={settings}
        />
      )}
      {activeTab === 'report' && (
        <ReportTab
          prospect={prospect}
          intake={getIntake(prospect.id)}
          evidence={getEvidence(prospect.id)}
          tests={getTests(prospect.id)}
          revenue={getRevenue(prospect.id)}
          scorecard={getScorecard(prospect.id)}
          initialReport={getReport(prospect.id)}
          settings={settings}
          onReportUpdate={handleReportUpdate}
        />
      )}
      {activeTab === 'followups' && (
        <FollowUpNotesTab
          prospectId={prospect.id}
          prospectName={prospect.companyName}
          stage={prospect.currentStage}
        />
      )}
    </div>
  );
}
