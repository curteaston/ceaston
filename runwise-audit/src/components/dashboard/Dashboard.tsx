import React, { useMemo } from 'react';
import type { Prospect, FollowUpTask, AuditReport } from '../../types';
import { Header } from '../layout/Header';
import { StatCard, Card } from '../layout/Card';
import { StageBadge } from '../layout/Badge';
import { computeRevenue } from '../../utils/revenueCalc';
import { getRevenue } from '../../utils/storage';

interface DashboardProps {
  prospects: Prospect[];
  followUps: FollowUpTask[];
  reports: Record<string, AuditReport>;
  onNavigate: (page: string, prospectId?: string) => void;
}

export function Dashboard({ prospects, followUps, reports, onNavigate }: DashboardProps) {
  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const auditsInProgress = prospects.filter((p) => p.auditStatus === 'in_progress').length;
    const auditsComplete = prospects.filter((p) => p.auditStatus === 'complete').length;
    const findingsCalls = prospects.filter((p) => p.currentStage === 'Findings Call Scheduled').length;
    const fixProposed = prospects.filter((p) => p.currentStage === '14-Day Fix Proposed').length;
    const pilotsWon = prospects.filter((p) => p.currentStage === 'Pilot Won').length;
    const followUpsDueToday = followUps.filter((f) => !f.completed && f.dueDate <= today).length;

    let totalExposure = 0;
    prospects.forEach((p) => {
      const rev = getRevenue(p.id);
      if (rev) {
        const calc = computeRevenue(rev);
        totalExposure += calc.monthlyRevenueExposure;
      }
    });

    return { auditsInProgress, auditsComplete, findingsCalls, fixProposed, pilotsWon, followUpsDueToday, totalExposure };
  }, [prospects, followUps, today]);

  const stageGroups = useMemo(() => {
    const groups: Record<string, Prospect[]> = {};
    prospects.forEach((p) => {
      if (!groups[p.currentStage]) groups[p.currentStage] = [];
      groups[p.currentStage].push(p);
    });
    return groups;
  }, [prospects]);

  const recentActivity = useMemo(() =>
    [...prospects]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5),
    [prospects]
  );

  const dueTodayList = followUps
    .filter((f) => !f.completed && f.dueDate <= today)
    .slice(0, 5);

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="RunWise Paid Lead Leak Audit — Overview"
      />

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard label="Total Prospects" value={prospects.length} />
        <StatCard label="Audits In Progress" value={stats.auditsInProgress} color="#D97706" />
        <StatCard label="Audits Complete" value={stats.auditsComplete} color="#059669" />
        <StatCard label="Findings Calls Scheduled" value={stats.findingsCalls} color="#7C3AED" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard label="14-Day Fix Proposed" value={stats.fixProposed} color="#2563EB" />
        <StatCard label="Pilots Won" value={stats.pilotsWon} color="#059669" />
        <StatCard
          label="Est. Monthly Exposure Identified"
          value={`$${stats.totalExposure.toLocaleString()}`}
          color="#DC2626"
          subtext="Directional estimate across all prospects"
        />
        <StatCard
          label="Follow-Ups Due Today"
          value={stats.followUpsDueToday}
          color={stats.followUpsDueToday > 0 ? '#DC2626' : '#374151'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Prospects by Stage */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 14 }}>
            Prospects by Stage
          </div>
          {Object.keys(stageGroups).length === 0 ? (
            <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>
              No prospects yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(stageGroups).map(([stage, items]) => (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StageBadge stage={stage as any} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{items.length}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Today's Follow-ups */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 14 }}>
            Today's Follow-Up List
          </div>
          {dueTodayList.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>
              No follow-ups due today. You're clear.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dueTodayList.map((task) => (
                <div key={task.id} style={{
                  padding: '10px 12px',
                  background: task.dueDate < today ? '#FEF2F2' : '#F9FAFB',
                  borderRadius: 7,
                  border: `1px solid ${task.dueDate < today ? '#FECACA' : '#E5E7EB'}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    {task.prospectName}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{task.action}</div>
                  <button
                    onClick={() => onNavigate('audit', task.prospectId)}
                    style={{
                      marginTop: 6, fontSize: 11, color: '#2F3C7E', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600,
                    }}
                  >
                    Open →
                  </button>
                </div>
              ))}
              {followUps.filter((f) => !f.completed && f.dueDate <= today).length > 5 && (
                <button
                  onClick={() => onNavigate('followups')}
                  style={{ fontSize: 12, color: '#2F3C7E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, textAlign: 'left', padding: 0 }}
                >
                  View all follow-ups →
                </button>
              )}
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 14 }}>
            Recent Prospects / Audit Activity
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>
              No prospect activity yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Company</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Location</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Stage</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Next Action</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}></th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 600, color: '#374151' }}>{p.companyName}</td>
                    <td style={{ padding: '10px 10px', color: '#6B7280' }}>{p.city}, {p.state}</td>
                    <td style={{ padding: '10px 10px' }}><StageBadge stage={p.currentStage} /></td>
                    <td style={{ padding: '10px 10px', color: '#6B7280', fontSize: 12 }}>
                      {p.nextActionDate ? new Date(p.nextActionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <button
                        onClick={() => onNavigate('audit', p.id)}
                        style={{
                          fontSize: 12, color: '#2F3C7E', background: 'none',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                        }}
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
