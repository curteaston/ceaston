import React, { useState } from 'react';
import type { Prospect } from '../../types';
import { PIPELINE_STAGES } from '../../types';
import { Card } from '../layout/Card';
import { StageBadge, AuditStatusBadge } from '../layout/Badge';
import { Button } from '../layout/Button';
import { FormField, Input, Textarea, Select } from '../layout/FormField';
import { saveProspects, getProspects } from '../../utils/storage';

interface OverviewTabProps {
  prospect: Prospect;
  onUpdate: (p: Prospect) => void;
}

export function OverviewTab({ prospect, onUpdate }: OverviewTabProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(prospect);

  const set = (field: keyof Prospect, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = () => {
    const all = getProspects();
    const updated = all.map((p) => (p.id === form.id ? form : p));
    saveProspects(updated);
    onUpdate(form);
    setEditing(false);
  };

  if (editing) {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <FormField label="Company Name" required>
            <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
          </FormField>
          <FormField label="Website">
            <Input value={form.website} onChange={(e) => set('website', e.target.value)} />
          </FormField>
          <FormField label="Owner Name">
            <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} />
          </FormField>
          <FormField label="Contact Title">
            <Input value={form.contactTitle} onChange={(e) => set('contactTitle', e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </FormField>
          <FormField label="Email">
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </FormField>
          <FormField label="City">
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </FormField>
          <FormField label="State">
            <Input value={form.state} onChange={(e) => set('state', e.target.value)} maxLength={2} />
          </FormField>
          <FormField label="Est. Monthly Google Ads Spend">
            <Input type="number" value={form.estimatedMonthlyGoogleAdsSpend} onChange={(e) => set('estimatedMonthlyGoogleAdsSpend', Number(e.target.value))} />
          </FormField>
          <FormField label="Fit Score (1-10)">
            <Input type="number" min={1} max={10} value={form.fitScore} onChange={(e) => set('fitScore', Number(e.target.value))} />
          </FormField>
          <FormField label="Pipeline Stage">
            <Select value={form.currentStage} onChange={(e) => set('currentStage', e.target.value as any)}>
              {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Audit Status">
            <Select value={form.auditStatus} onChange={(e) => set('auditStatus', e.target.value as any)}>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
            </Select>
          </FormField>
          <FormField label="Next Action Date">
            <Input type="date" value={form.nextActionDate} onChange={(e) => set('nextActionDate', e.target.value)} />
          </FormField>
          <FormField label="Last Contacted Date">
            <Input type="date" value={form.lastContactedDate} onChange={(e) => set('lastContactedDate', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Notes">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </FormField>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button onClick={handleSave}>Save Changes</Button>
          <Button variant="ghost" onClick={() => { setForm(prospect); setEditing(false); }}>Cancel</Button>
        </div>
      </div>
    );
  }

  const info = [
    { label: 'Website', value: prospect.website || '—' },
    { label: 'Phone', value: prospect.phone || '—' },
    { label: 'Email', value: prospect.email || '—' },
    { label: 'Location', value: `${prospect.city || '—'}, ${prospect.state || '—'}` },
    { label: 'Contact Title', value: prospect.contactTitle || '—' },
    { label: 'Est. Monthly Ad Spend', value: prospect.estimatedMonthlyGoogleAdsSpend ? `$${prospect.estimatedMonthlyGoogleAdsSpend.toLocaleString()}/mo` : '—' },
    { label: 'Est. Company Revenue', value: prospect.estimatedCompanyRevenue ? `$${prospect.estimatedCompanyRevenue.toLocaleString()}/yr` : '—' },
    { label: 'Next Action Date', value: prospect.nextActionDate ? new Date(prospect.nextActionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
    { label: 'Last Contacted', value: prospect.lastContactedDate ? new Date(prospect.lastContactedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>{prospect.companyName}</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{prospect.ownerName}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 0' }}>
          {info.map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 12 }}>Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Pipeline Stage</span>
              <StageBadge stage={prospect.currentStage} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Audit Status</span>
              <AuditStatusBadge status={prospect.auditStatus} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Fit Score</span>
              <span style={{
                display: 'inline-block', width: 28, height: 28, lineHeight: '28px',
                borderRadius: '50%', textAlign: 'center', fontSize: 12, fontWeight: 700,
                background: prospect.fitScore >= 8 ? '#D1FAE5' : prospect.fitScore >= 5 ? '#FEF3C7' : '#FEE2E2',
                color: prospect.fitScore >= 8 ? '#065F46' : prospect.fitScore >= 5 ? '#92400E' : '#991B1B',
              }}>
                {prospect.fitScore}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 10 }}>Lead Sources</div>
          {prospect.leadSourcesObserved.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>None documented</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {prospect.leadSourcesObserved.map((s) => (
                <span key={s} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 4,
                  background: '#EEF2FF', color: '#2F3C7E', fontWeight: 500,
                }}>{s}</span>
              ))}
            </div>
          )}
        </Card>

        {prospect.notes && (
          <Card>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>Notes</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{prospect.notes}</div>
          </Card>
        )}
      </div>
    </div>
  );
}
