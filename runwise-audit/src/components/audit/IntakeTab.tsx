import React, { useState } from 'react';
import type { IntakeAnswers } from '../../types';
import { Card } from '../layout/Card';
import { Button } from '../layout/Button';
import { FormField, Input, Textarea, Select } from '../layout/FormField';
import { saveIntake } from '../../utils/storage';

interface IntakeTabProps {
  prospectId: string;
  initial: IntakeAnswers | null;
}

function makeEmpty(prospectId: string): IntakeAnswers {
  return {
    prospectId,
    paidLeadSources: '',
    formEmailLeadDestination: '',
    whoResponds: '',
    afterHoursProcess: '',
    tracksMissedCallsAndResponseTime: '',
    permissionToTest: '',
    normalBusinessHours: '',
    afterHoursDetail: '',
    leadFollowUpOwner: '',
    bookingSystem: '',
    responseTimeTrackingMethod: '',
    missedCallTrackingMethod: '',
    knownPainPoints: '',
    permissionNormalHoursTest: null,
    permissionAfterHoursTest: null,
    permissionNotes: '',
    completedAt: '',
  };
}

export function IntakeTab({ prospectId, initial }: IntakeTabProps) {
  const [form, setForm] = useState<IntakeAnswers>(initial ?? makeEmpty(prospectId));
  const [saved, setSaved] = useState(false);

  const set = (field: keyof IntakeAnswers, value: any) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const data = { ...form, completedAt: form.completedAt || new Date().toISOString() };
    saveIntake(data);
    setForm(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Q = ({ number, question, field, multiline = false }: { number: string; question: string; field: keyof IntakeAnswers; multiline?: boolean }) => (
    <div style={{ padding: '16px 0', borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        Question {number}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{question}</div>
      {multiline ? (
        <Textarea
          value={form[field] as string}
          onChange={(e) => set(field, e.target.value)}
          rows={3}
          placeholder="Enter answer..."
        />
      ) : (
        <Input
          value={form[field] as string}
          onChange={(e) => set(field, e.target.value)}
          placeholder="Enter answer..."
        />
      )}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 4 }}>Phone Intake Questionnaire</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 0 }}>Core audit discovery questions</div>

        <Q number="1" question="Where do your paid leads come from?" field="paidLeadSources" multiline />
        <Q number="2" question="Where do form/email leads go?" field="formEmailLeadDestination" multiline />
        <Q number="3" question="Who responds to those leads?" field="whoResponds" />
        <Q number="4" question="What happens after hours?" field="afterHoursProcess" multiline />
        <Q number="5" question="Do you track missed calls and response time?" field="tracksMissedCallsAndResponseTime" multiline />
        <Q number="6" question="Can I run one controlled test (form submission)?" field="permissionToTest" multiline />
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 12 }}>Operational Details</div>

          <FormField label="Normal Business Hours">
            <Input value={form.normalBusinessHours} onChange={(e) => set('normalBusinessHours', e.target.value)} placeholder="Mon-Fri 8am-5pm, Sat 9am-2pm" />
          </FormField>
          <FormField label="After-Hours Process (detail)">
            <Textarea value={form.afterHoursDetail} onChange={(e) => set('afterHoursDetail', e.target.value)} rows={2} />
          </FormField>
          <FormField label="Who Owns Lead Follow-Up">
            <Input value={form.leadFollowUpOwner} onChange={(e) => set('leadFollowUpOwner', e.target.value)} />
          </FormField>
          <FormField label="Booking System / Calendar">
            <Input value={form.bookingSystem} onChange={(e) => set('bookingSystem', e.target.value)} placeholder="ServiceTitan, paper, phone calendar..." />
          </FormField>
          <FormField label="Response Time Tracking Method">
            <Input value={form.responseTimeTrackingMethod} onChange={(e) => set('responseTimeTrackingMethod', e.target.value)} placeholder="CallRail, none, manual..." />
          </FormField>
          <FormField label="Missed Call Tracking Method">
            <Input value={form.missedCallTrackingMethod} onChange={(e) => set('missedCallTrackingMethod', e.target.value)} placeholder="CallRail, none, manual..." />
          </FormField>
          <FormField label="Known Pain Points">
            <Textarea value={form.knownPainPoints} onChange={(e) => set('knownPainPoints', e.target.value)} rows={2} />
          </FormField>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 12 }}>Test Permissions</div>

          <FormField label="Permission: Normal-Hours Test">
            <Select
              value={form.permissionNormalHoursTest === null ? '' : form.permissionNormalHoursTest ? 'yes' : 'no'}
              onChange={(e) => set('permissionNormalHoursTest', e.target.value === '' ? null : e.target.value === 'yes')}
            >
              <option value="">Not yet asked</option>
              <option value="yes">Yes — approved</option>
              <option value="no">No — declined</option>
            </Select>
          </FormField>

          <FormField label="Permission: After-Hours Test">
            <Select
              value={form.permissionAfterHoursTest === null ? '' : form.permissionAfterHoursTest ? 'yes' : 'no'}
              onChange={(e) => set('permissionAfterHoursTest', e.target.value === '' ? null : e.target.value === 'yes')}
            >
              <option value="">Not yet asked</option>
              <option value="yes">Yes — approved</option>
              <option value="no">No — declined</option>
            </Select>
          </FormField>

          <FormField label="Permission Notes">
            <Textarea value={form.permissionNotes} onChange={(e) => set('permissionNotes', e.target.value)} rows={2} />
          </FormField>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button onClick={handleSave}>
              {saved ? '✓ Saved' : 'Save Intake'}
            </Button>
            {form.completedAt && (
              <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>
                Last saved {new Date(form.completedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
