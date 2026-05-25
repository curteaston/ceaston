import React, { useState } from 'react';
import type { EvidenceItem, EvidenceStatus } from '../../types';
import { Card } from '../layout/Card';
import { Badge } from '../layout/Badge';
import { Button } from '../layout/Button';
import { FormField, Input, Textarea, Select } from '../layout/FormField';
import { saveEvidence } from '../../utils/storage';

const EVIDENCE_TYPES: EvidenceItem['type'][] = [
  'Recent lead emails (2-3)',
  'Missed call screenshot',
  'Google LSA screenshot',
  'Facebook lead screenshot',
  'Angi/HomeAdvisor screenshot',
  'Permission to test website form',
  'Permission to test after-hours form',
  'Dispatcher/CSR process notes',
];

const STATUS_VARIANTS: Record<EvidenceStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  Received: 'success',
  Requested: 'warning',
  'Not Available': 'danger',
  'Not Needed': 'neutral',
};

interface EvidenceTabProps {
  prospectId: string;
  initial: EvidenceItem[];
}

export function EvidenceTab({ prospectId, initial }: EvidenceTabProps) {
  const [items, setItems] = useState<EvidenceItem[]>(() => {
    if (initial.length > 0) return initial;
    return EVIDENCE_TYPES.map((type, i) => ({
      id: `ev-${prospectId}-${i}`,
      prospectId,
      type,
      status: 'Requested' as EvidenceStatus,
      link: '',
      notes: '',
      dateReceived: '',
      visibilityGap: false,
    }));
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateItem = (id: string, updates: Partial<EvidenceItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    setSaved(false);
  };

  const handleSave = () => {
    saveEvidence(prospectId, items);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setEditingId(null);
  };

  const visGaps = items.filter((i) => i.visibilityGap);
  const received = items.filter((i) => i.status === 'Received');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#374151' }}>
            <strong>{received.length}</strong> / {items.length} received
          </span>
          {visGaps.length > 0 && (
            <span style={{
              fontSize: 12, padding: '2px 8px', borderRadius: 4,
              background: '#FEE2E2', color: '#991B1B', fontWeight: 600,
            }}>
              {visGaps.length} visibility gap{visGaps.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Button onClick={handleSave} size="sm">
          {saved ? '✓ Saved' : 'Save All'}
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <Card key={item.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                  padding: '14px 16px',
                  borderLeft: `4px solid ${item.visibilityGap ? '#DC2626' : item.status === 'Received' ? '#059669' : '#E5E7EB'}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{item.type}</span>
                    <Badge label={item.status} variant={STATUS_VARIANTS[item.status]} />
                    {item.visibilityGap && (
                      <Badge label="Visibility Gap" variant="danger" />
                    )}
                  </div>
                  {!isEditing && (
                    <>
                      {item.notes && <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>{item.notes}</div>}
                      {item.dateReceived && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Received: {item.dateReceived}</div>}
                      {item.link && <div style={{ fontSize: 11, color: '#2F3C7E', marginTop: 4 }}>Link: {item.link}</div>}
                    </>
                  )}
                </div>

                {!isEditing && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(item.id)}>Edit</Button>
                )}
              </div>

              {isEditing && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginTop: 12 }}>
                    <FormField label="Status">
                      <Select value={item.status} onChange={(e) => updateItem(item.id, { status: e.target.value as EvidenceStatus })}>
                        <option>Requested</option>
                        <option>Received</option>
                        <option>Not Available</option>
                        <option>Not Needed</option>
                      </Select>
                    </FormField>
                    <FormField label="Date Received">
                      <Input type="date" value={item.dateReceived} onChange={(e) => updateItem(item.id, { dateReceived: e.target.value })} />
                    </FormField>
                  </div>
                  <FormField label="Link / Reference">
                    <Input value={item.link} onChange={(e) => updateItem(item.id, { link: e.target.value })} placeholder="Drive link, screenshot URL, etc." />
                  </FormField>
                  <FormField label="Notes">
                    <Textarea value={item.notes} onChange={(e) => updateItem(item.id, { notes: e.target.value })} rows={2} />
                  </FormField>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={item.visibilityGap}
                        onChange={(e) => updateItem(item.id, { visibilityGap: e.target.checked })}
                      />
                      Flag as Visibility Gap
                    </label>
                    <Button size="sm" onClick={() => { handleSave(); setEditingId(null); }}>Done</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
