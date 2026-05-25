import React, { useState } from 'react';
import type { ControlledTest, TestType, TestOutcome } from '../../types';
import { Card } from '../layout/Card';
import { Button } from '../layout/Button';
import { TestOutcomeBadge } from '../layout/Badge';
import { FormField, Input, Textarea, Select } from '../layout/FormField';
import { saveTests } from '../../utils/storage';

function makeEmpty(prospectId: string): ControlledTest {
  return {
    id: `t${Date.now()}`,
    prospectId,
    testType: 'Normal-hours website form',
    testDate: new Date().toISOString().split('T')[0],
    testTime: '',
    leadSourceTested: 'Website form',
    testNameUsed: '',
    testPhoneEmail: '',
    responseReceived: null,
    timeToFirstResponse: '',
    responseMethod: '',
    callAnswered: null,
    voicemailLeft: null,
    bookingAttempted: null,
    followUpReceived: null,
    notes: '',
    screenshotLink: '',
    outcome: '',
  };
}

const YesNo = ({
  label, value, onChange,
}: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) => (
  <FormField label={label}>
    <Select
      value={value === null ? '' : value ? 'yes' : 'no'}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'yes')}
    >
      <option value="">—</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </Select>
  </FormField>
);

interface TestsTabProps {
  prospectId: string;
  initial: ControlledTest[];
}

export function TestsTab({ prospectId, initial }: TestsTabProps) {
  const [tests, setTests] = useState<ControlledTest[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<ControlledTest | null>(null);

  const persist = (updated: ControlledTest[]) => {
    saveTests(prospectId, updated);
    setTests(updated);
  };

  const startAdd = () => {
    setDraft(makeEmpty(prospectId));
    setIsAdding(true);
    setEditingId(null);
  };

  const startEdit = (t: ControlledTest) => {
    setDraft({ ...t });
    setEditingId(t.id);
    setIsAdding(false);
  };

  const saveDraft = () => {
    if (!draft) return;
    if (isAdding) {
      persist([...tests, draft]);
      setIsAdding(false);
    } else {
      persist(tests.map((t) => (t.id === draft.id ? draft : t)));
      setEditingId(null);
    }
    setDraft(null);
  };

  const deleteTest = (id: string) => {
    if (!confirm('Delete this test?')) return;
    persist(tests.filter((t) => t.id !== id));
  };

  const setD = (field: keyof ControlledTest, value: any) =>
    setDraft((prev) => prev ? ({ ...prev, [field]: value }) : prev);

  const renderForm = () => {
    if (!draft) return null;
    return (
      <Card style={{ background: '#F9FAFB', border: '1px solid #2F3C7E' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 16 }}>
          {isAdding ? 'Add Controlled Test' : 'Edit Test'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label="Test Type">
            <Select value={draft.testType} onChange={(e) => setD('testType', e.target.value as TestType)}>
              <option>Normal-hours website form</option>
              <option>After-hours website form</option>
              <option>Aggregator/email routing test</option>
              <option>Other</option>
            </Select>
          </FormField>
          <FormField label="Lead Source Tested">
            <Input value={draft.leadSourceTested} onChange={(e) => setD('leadSourceTested', e.target.value)} />
          </FormField>
          <FormField label="Test Date">
            <Input type="date" value={draft.testDate} onChange={(e) => setD('testDate', e.target.value)} />
          </FormField>
          <FormField label="Test Time">
            <Input value={draft.testTime} onChange={(e) => setD('testTime', e.target.value)} placeholder="e.g. 2:15 PM" />
          </FormField>
          <FormField label="Test Name Used">
            <Input value={draft.testNameUsed} onChange={(e) => setD('testNameUsed', e.target.value)} placeholder="Fake name used in the form" />
          </FormField>
          <FormField label="Test Phone/Email">
            <Input value={draft.testPhoneEmail} onChange={(e) => setD('testPhoneEmail', e.target.value)} placeholder="test@runwise.internal" />
          </FormField>
          <YesNo label="Response Received?" value={draft.responseReceived} onChange={(v) => setD('responseReceived', v)} />
          <FormField label="Time to First Response">
            <Input value={draft.timeToFirstResponse} onChange={(e) => setD('timeToFirstResponse', e.target.value)} placeholder="e.g. 4 hours 17 minutes / No response" />
          </FormField>
          <FormField label="Response Method">
            <Select value={draft.responseMethod} onChange={(e) => setD('responseMethod', e.target.value)}>
              <option value="">—</option>
              <option>Call</option>
              <option>Text</option>
              <option>Email</option>
              <option>None</option>
            </Select>
          </FormField>
          <FormField label="Outcome / Severity">
            <Select value={draft.outcome} onChange={(e) => setD('outcome', e.target.value as TestOutcome)}>
              <option value="">—</option>
              <option>Strong</option>
              <option>Moderate</option>
              <option>Weak</option>
              <option>Critical leak</option>
              <option>Inconclusive</option>
            </Select>
          </FormField>
          <YesNo label="Call Answered?" value={draft.callAnswered} onChange={(v) => setD('callAnswered', v)} />
          <YesNo label="Voicemail Left?" value={draft.voicemailLeft} onChange={(v) => setD('voicemailLeft', v)} />
          <YesNo label="Booking Attempted?" value={draft.bookingAttempted} onChange={(v) => setD('bookingAttempted', v)} />
          <YesNo label="Follow-Up Received?" value={draft.followUpReceived} onChange={(v) => setD('followUpReceived', v)} />
        </div>
        <FormField label="Screenshot / Loom Link">
          <Input value={draft.screenshotLink} onChange={(e) => setD('screenshotLink', e.target.value)} placeholder="Drive or Loom URL" />
        </FormField>
        <FormField label="Notes">
          <Textarea value={draft.notes} onChange={(e) => setD('notes', e.target.value)} rows={3} />
        </FormField>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button onClick={saveDraft}>Save Test</Button>
          <Button variant="ghost" onClick={() => { setDraft(null); setIsAdding(false); setEditingId(null); }}>Cancel</Button>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          {tests.length} test{tests.length !== 1 ? 's' : ''} recorded
        </div>
        <Button onClick={startAdd} size="sm">+ Add Test</Button>
      </div>

      {(isAdding || editingId) && renderForm()}

      {tests.length === 0 && !isAdding && (
        <Card>
          <div style={{ textAlign: 'center', padding: '32px 20px', color: '#9CA3AF' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>◉</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>No tests recorded yet</div>
            <div style={{ fontSize: 13 }}>Add a controlled test to document lead response behavior.</div>
            <Button onClick={startAdd} style={{ marginTop: 16 }} size="sm">+ Add First Test</Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {tests.map((t) => (
          editingId === t.id ? null : (
            <Card key={t.id} style={{
              borderLeft: `4px solid ${
                t.outcome === 'Critical leak' ? '#DC2626' :
                t.outcome === 'Weak' ? '#D97706' :
                t.outcome === 'Strong' ? '#059669' :
                '#E5E7EB'
              }`,
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{t.testType}</span>
                    <TestOutcomeBadge outcome={t.outcome} />
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>{t.testDate} {t.testTime}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 20px', fontSize: 12 }}>
                    <div>
                      <span style={{ color: '#9CA3AF' }}>Lead source: </span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{t.leadSourceTested}</span>
                    </div>
                    <div>
                      <span style={{ color: '#9CA3AF' }}>Response: </span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>
                        {t.responseReceived === null ? '—' : t.responseReceived ? `Yes (${t.responseMethod})` : 'None'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#9CA3AF' }}>Time to respond: </span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{t.timeToFirstResponse || '—'}</span>
                    </div>
                    <div>
                      <span style={{ color: '#9CA3AF' }}>Booking attempted: </span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>
                        {t.bookingAttempted === null ? '—' : t.bookingAttempted ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#9CA3AF' }}>Follow-up: </span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>
                        {t.followUpReceived === null ? '—' : t.followUpReceived ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#9CA3AF' }}>Test name: </span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{t.testNameUsed || '—'}</span>
                    </div>
                  </div>

                  {t.notes && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280', lineHeight: 1.4, padding: '8px 10px', background: '#F9FAFB', borderRadius: 6 }}>
                      {t.notes}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteTest(t.id)}>Delete</Button>
                </div>
              </div>
            </Card>
          )
        ))}
      </div>
    </div>
  );
}
