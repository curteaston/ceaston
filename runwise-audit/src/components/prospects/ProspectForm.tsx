import React, { useState } from 'react';
import type { Prospect, PipelineStage, LeadSource } from '../../types';
import { PIPELINE_STAGES, LEAD_SOURCES } from '../../types';
import { Modal } from '../layout/Modal';
import { Button } from '../layout/Button';
import { FormField, Input, Textarea, Select } from '../layout/FormField';

interface ProspectFormProps {
  prospect?: Prospect;
  onSave: (p: Prospect) => void;
  onClose: () => void;
}

function makeEmpty(): Omit<Prospect, 'id' | 'createdAt'> {
  return {
    companyName: '',
    website: '',
    city: '',
    state: '',
    ownerName: '',
    contactTitle: '',
    phone: '',
    email: '',
    estimatedMonthlyGoogleAdsSpend: 0,
    estimatedCompanyRevenue: 0,
    leadSourcesObserved: [],
    notes: '',
    currentStage: 'Prospect Identified',
    nextActionDate: '',
    lastContactedDate: '',
    fitScore: 5,
    auditStatus: 'not_started',
  };
}

export function ProspectForm({ prospect, onSave, onClose }: ProspectFormProps) {
  const [form, setForm] = useState<Omit<Prospect, 'id' | 'createdAt'>>(
    prospect ? {
      companyName: prospect.companyName,
      website: prospect.website,
      city: prospect.city,
      state: prospect.state,
      ownerName: prospect.ownerName,
      contactTitle: prospect.contactTitle,
      phone: prospect.phone,
      email: prospect.email,
      estimatedMonthlyGoogleAdsSpend: prospect.estimatedMonthlyGoogleAdsSpend,
      estimatedCompanyRevenue: prospect.estimatedCompanyRevenue,
      leadSourcesObserved: prospect.leadSourcesObserved,
      notes: prospect.notes,
      currentStage: prospect.currentStage,
      nextActionDate: prospect.nextActionDate,
      lastContactedDate: prospect.lastContactedDate,
      fitScore: prospect.fitScore,
      auditStatus: prospect.auditStatus,
    } : makeEmpty()
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: keyof typeof form, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleLeadSource = (src: LeadSource) => {
    setForm((prev) => ({
      ...prev,
      leadSourcesObserved: prev.leadSourcesObserved.includes(src)
        ? prev.leadSourcesObserved.filter((s) => s !== src)
        : [...prev.leadSourcesObserved, src],
    }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.companyName.trim()) errs.companyName = 'Required';
    if (!form.ownerName.trim()) errs.ownerName = 'Required';
    if (form.fitScore < 1 || form.fitScore > 10) errs.fitScore = 'Must be 1-10';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const id = prospect?.id ?? `p${Date.now()}`;
    const createdAt = prospect?.createdAt ?? new Date().toISOString();
    onSave({ id, createdAt, ...form });
  };

  return (
    <Modal
      title={prospect ? `Edit: ${prospect.companyName}` : 'Add New Prospect'}
      onClose={onClose}
      width={720}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{prospect ? 'Save Changes' : 'Add Prospect'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        <FormField label="Company Name" required error={errors.companyName}>
          <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} hasError={!!errors.companyName} />
        </FormField>
        <FormField label="Website">
          <Input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="example.com" />
        </FormField>
        <FormField label="Owner Name" required error={errors.ownerName}>
          <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} hasError={!!errors.ownerName} />
        </FormField>
        <FormField label="Contact Title">
          <Input value={form.contactTitle} onChange={(e) => set('contactTitle', e.target.value)} placeholder="Owner, GM, etc." />
        </FormField>
        <FormField label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </FormField>
        <FormField label="Email">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </FormField>
        <FormField label="City">
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </FormField>
        <FormField label="State">
          <Input value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="TN" maxLength={2} />
        </FormField>
        <FormField label="Est. Monthly Google Ads Spend ($)">
          <Input type="number" value={form.estimatedMonthlyGoogleAdsSpend} onChange={(e) => set('estimatedMonthlyGoogleAdsSpend', Number(e.target.value))} />
        </FormField>
        <FormField label="Est. Company Annual Revenue ($)">
          <Input type="number" value={form.estimatedCompanyRevenue} onChange={(e) => set('estimatedCompanyRevenue', Number(e.target.value))} />
        </FormField>
        <FormField label="Pipeline Stage">
          <Select value={form.currentStage} onChange={(e) => set('currentStage', e.target.value as PipelineStage)}>
            {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormField>
        <FormField label="Fit Score (1-10)" error={errors.fitScore}>
          <Input type="number" min={1} max={10} value={form.fitScore} onChange={(e) => set('fitScore', Number(e.target.value))} hasError={!!errors.fitScore} />
        </FormField>
        <FormField label="Next Action Date">
          <Input type="date" value={form.nextActionDate} onChange={(e) => set('nextActionDate', e.target.value)} />
        </FormField>
        <FormField label="Last Contacted Date">
          <Input type="date" value={form.lastContactedDate} onChange={(e) => set('lastContactedDate', e.target.value)} />
        </FormField>
      </div>

      <FormField label="Lead Sources Observed" hint="Select all that apply">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {LEAD_SOURCES.map((src) => {
            const checked = form.leadSourcesObserved.includes(src);
            return (
              <button
                key={src}
                type="button"
                onClick={() => toggleLeadSource(src)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontFamily: 'inherit',
                  cursor: 'pointer', fontWeight: checked ? 600 : 400,
                  background: checked ? '#2F3C7E' : '#F3F4F6',
                  color: checked ? '#fff' : '#374151',
                  border: `1px solid ${checked ? '#2F3C7E' : '#E5E7EB'}`,
                }}
              >
                {src}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label="Notes">
        <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </FormField>
    </Modal>
  );
}
