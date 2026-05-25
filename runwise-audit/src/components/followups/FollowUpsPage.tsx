import React, { useState } from 'react';
import type { FollowUpTask, Prospect, AuditReport } from '../../types';
import { Header } from '../layout/Header';
import { Card } from '../layout/Card';
import { Badge } from '../layout/Badge';
import { StageBadge } from '../layout/Badge';
import { Button } from '../layout/Button';
import { saveFollowUps } from '../../utils/storage';

interface FollowUpsPageProps {
  followUps: FollowUpTask[];
  prospects: Prospect[];
  reports: Record<string, AuditReport>;
  onFollowUpsChange: (tasks: FollowUpTask[]) => void;
  onOpenProspect: (id: string) => void;
}

export function FollowUpsPage({ followUps, prospects, reports, onFollowUpsChange, onOpenProspect }: FollowUpsPageProps) {
  const today = new Date().toISOString().split('T')[0];

  const overdue = followUps.filter((f) => !f.completed && f.dueDate && f.dueDate < today);
  const dueToday = followUps.filter((f) => !f.completed && f.dueDate === today);
  const upcoming = followUps.filter((f) => !f.completed && (!f.dueDate || f.dueDate > today));
  const completed = followUps.filter((f) => f.completed);

  // Prospects with drafted but not presented reports
  const draftedNotPresented = prospects.filter((p) => {
    const r = reports[p.id];
    return r && r.isDrafted && p.currentStage !== 'Findings Presented' && p.currentStage !== '14-Day Fix Proposed' && p.currentStage !== 'Pilot Won';
  });

  // Prospects with fix proposed but not closed
  const fixProposedOpen = prospects.filter((p) =>
    p.currentStage === '14-Day Fix Proposed'
  );

  // Findings calls scheduled
  const findingsCalls = prospects.filter((p) => p.currentStage === 'Findings Call Scheduled');

  const toggleComplete = (id: string) => {
    const updated = followUps.map((f) => (f.id === id ? { ...f, completed: !f.completed } : f));
    saveFollowUps(updated);
    onFollowUpsChange(updated);
  };

  const TaskRow = ({ task }: { task: FollowUpTask }) => {
    const isOverdue = task.dueDate && task.dueDate < today;
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 16px',
        background: isOverdue ? '#FEF2F2' : '#fff',
        border: `1px solid ${isOverdue ? '#FECACA' : '#E5E7EB'}`,
        borderRadius: 8,
      }}>
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => toggleComplete(task.id)}
          style={{ marginTop: 2, cursor: 'pointer' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{task.prospectName}</span>
            <StageBadge stage={task.stage} />
            {isOverdue && <Badge label="OVERDUE" variant="danger" />}
          </div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{task.action}</div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9CA3AF' }}>
            {task.dueDate && (
              <span>Due: {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            )}
            {task.notes && <span>· {task.notes}</span>}
          </div>
        </div>
        <Button size="sm" onClick={() => onOpenProspect(task.prospectId)}>Open →</Button>
      </div>
    );
  };

  const Section = ({ title, tasks, emptyText }: { title: string; tasks: FollowUpTask[]; emptyText: string }) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: '#6B7280', fontWeight: 600 }}>
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0' }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <Header title="Follow-Up Command Center" subtitle="All outstanding actions and upcoming calls" />

      {/* Special alerts */}
      {(draftedNotPresented.length > 0 || fixProposedOpen.length > 0 || findingsCalls.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {findingsCalls.length > 0 && (
            <Card style={{ borderLeft: '4px solid #7C3AED' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', marginBottom: 6 }}>
                Findings Calls Scheduled
              </div>
              {findingsCalls.map((p) => (
                <div key={p.id} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                  <button onClick={() => onOpenProspect(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F3C7E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0 }}>
                    {p.companyName} →
                  </button>
                </div>
              ))}
            </Card>
          )}
          {draftedNotPresented.length > 0 && (
            <Card style={{ borderLeft: '4px solid #F4C95D' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: 6 }}>
                Reports Drafted — Not Presented
              </div>
              {draftedNotPresented.map((p) => (
                <div key={p.id} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                  <button onClick={() => onOpenProspect(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F3C7E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0 }}>
                    {p.companyName} →
                  </button>
                </div>
              ))}
            </Card>
          )}
          {fixProposedOpen.length > 0 && (
            <Card style={{ borderLeft: '4px solid #059669' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: 6 }}>
                14-Day Fix Proposed — Open
              </div>
              {fixProposedOpen.map((p) => (
                <div key={p.id} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                  <button onClick={() => onOpenProspect(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F3C7E', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0 }}>
                    {p.companyName} →
                  </button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      <Section title="Overdue" tasks={overdue} emptyText="No overdue follow-ups. Nice work." />
      <Section title="Due Today" tasks={dueToday} emptyText="Nothing due today." />
      <Section title="Upcoming" tasks={upcoming} emptyText="No upcoming follow-ups scheduled." />

      {completed.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF', marginBottom: 10 }}>
            Completed ({completed.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.6 }}>
            {completed.slice(0, 10).map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB' }}>
                <input type="checkbox" checked onChange={() => toggleComplete(t.id)} style={{ cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'line-through' }}>{t.prospectName} · {t.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
