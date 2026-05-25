import React, { useState, useMemo } from 'react';
import type { Prospect, PipelineStage, LeadSource } from '../../types';
import { PIPELINE_STAGES, LEAD_SOURCES } from '../../types';
import { Header } from '../layout/Header';
import { Button } from '../layout/Button';
import { StageBadge, AuditStatusBadge } from '../layout/Badge';
import { ProspectForm } from './ProspectForm';
import { Card } from '../layout/Card';
import { Input, Select } from '../layout/FormField';

interface ProspectsPageProps {
  prospects: Prospect[];
  onSave: (p: Prospect) => void;
  onOpen: (id: string) => void;
}

export function ProspectsPage({ prospects, onSave, onOpen }: ProspectsPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | undefined>();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [maxSpend, setMaxSpend] = useState('');

  const filtered = useMemo(() => {
    return prospects.filter((p) => {
      if (search && !p.companyName.toLowerCase().includes(search.toLowerCase())) return false;
      if (stageFilter && p.currentStage !== stageFilter) return false;
      if (sourceFilter && !p.leadSourcesObserved.includes(sourceFilter as LeadSource)) return false;
      if (minSpend && p.estimatedMonthlyGoogleAdsSpend < Number(minSpend)) return false;
      if (maxSpend && p.estimatedMonthlyGoogleAdsSpend > Number(maxSpend)) return false;
      return true;
    });
  }, [prospects, search, stageFilter, sourceFilter, minSpend, maxSpend]);

  const handleSave = (p: Prospect) => {
    onSave(p);
    setShowForm(false);
    setEditingProspect(undefined);
  };

  return (
    <div>
      <Header
        title="Prospects"
        subtitle={`${prospects.length} total prospect${prospects.length !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => { setEditingProspect(undefined); setShowForm(true); }}>
            + Add Prospect
          </Button>
        }
      />

      {/* Filters */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Search</div>
            <Input
              placeholder="Search company name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Stage</div>
            <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              <option value="">All stages</option>
              {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Lead Source</div>
            <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All sources</option>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Min Spend</div>
            <Input type="number" placeholder="$0" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Max Spend</div>
            <Input type="number" placeholder="No limit" value={maxSpend} onChange={(e) => setMaxSpend(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◉</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>No prospects found</div>
            <div style={{ fontSize: 13 }}>
              {prospects.length === 0
                ? 'Add your first prospect to get started.'
                : 'Try adjusting your filters.'}
            </div>
            {prospects.length === 0 && (
              <Button onClick={() => setShowForm(true)} style={{ marginTop: 16 }}>
                + Add Prospect
              </Button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Company</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Location</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Ad Spend</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Lead Sources</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Stage</th>
                <th style={{ textAlign: 'center', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Fit</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>Next Action</th>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#374151' }}>{p.companyName}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>{p.ownerName}</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280' }}>{p.city}, {p.state}</td>
                  <td style={{ padding: '12px 16px', color: '#374151', fontWeight: 500 }}>
                    ${p.estimatedMonthlyGoogleAdsSpend.toLocaleString()}/mo
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.leadSourcesObserved.slice(0, 2).map((s) => (
                        <span key={s} style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 3,
                          background: '#EEF2FF', color: '#2F3C7E', fontWeight: 500,
                        }}>{s}</span>
                      ))}
                      {p.leadSourcesObserved.length > 2 && (
                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>+{p.leadSourcesObserved.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><StageBadge stage={p.currentStage} /></td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', width: 28, height: 28, lineHeight: '28px',
                      borderRadius: '50%', textAlign: 'center', fontSize: 12, fontWeight: 700,
                      background: p.fitScore >= 8 ? '#D1FAE5' : p.fitScore >= 5 ? '#FEF3C7' : '#FEE2E2',
                      color: p.fitScore >= 8 ? '#065F46' : p.fitScore >= 5 ? '#92400E' : '#991B1B',
                    }}>
                      {p.fitScore}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B7280' }}>
                    {p.nextActionDate ? new Date(p.nextActionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="sm" onClick={() => onOpen(p.id)}>Open</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingProspect(p); setShowForm(true); }}>Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showForm && (
        <ProspectForm
          prospect={editingProspect}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingProspect(undefined); }}
        />
      )}
    </div>
  );
}
