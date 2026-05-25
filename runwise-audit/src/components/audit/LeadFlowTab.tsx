import React, { useState } from 'react';
import type { LeadFlowMap, LeadFlowNode, LeakGap } from '../../types';
import { LEAK_GAPS } from '../../types';
import { Card } from '../layout/Card';
import { Button } from '../layout/Button';
import { Badge } from '../layout/Badge';
import { FormField, Input, Textarea } from '../layout/FormField';
import { saveLeadFlow } from '../../utils/storage';

const GAP_COLORS: Record<LeakGap, string> = {
  'Delay gap': '#D97706',
  'After-hours gap': '#7C3AED',
  'Missed-call gap': '#DC2626',
  'No follow-up gap': '#B45309',
  'No visibility/reporting gap': '#0369A1',
  'Manual handoff gap': '#065F46',
  'No booking confirmation gap': '#9F1239',
};

const DEFAULT_NODES: LeadFlowNode[] = [
  { id: 'n1', label: 'Lead Source (Ad Click / Aggregator)', gaps: [] },
  { id: 'n2', label: 'Form / Email / Call Notification', gaps: [] },
  { id: 'n3', label: 'Office / Dispatcher / Owner', gaps: [] },
  { id: 'n4', label: 'Callback / Text / Email', gaps: [] },
  { id: 'n5', label: 'Booking Attempt', gaps: [] },
  { id: 'n6', label: 'Outcome Logged', gaps: [] },
];

interface LeadFlowTabProps {
  prospectId: string;
  initial: LeadFlowMap | null;
}

export function LeadFlowTab({ prospectId, initial }: LeadFlowTabProps) {
  const [map, setMap] = useState<LeadFlowMap>(
    initial ?? { prospectId, nodes: DEFAULT_NODES, notes: '' }
  );
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateNode = (id: string, updates: Partial<LeadFlowNode>) =>
    setMap((prev) => ({ ...prev, nodes: prev.nodes.map((n) => n.id === id ? { ...n, ...updates } : n) }));

  const toggleGap = (nodeId: string, gap: LeakGap) => {
    const node = map.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const gaps = node.gaps.includes(gap) ? node.gaps.filter((g) => g !== gap) : [...node.gaps, gap];
    updateNode(nodeId, { gaps });
    setSaved(false);
  };

  const handleSave = () => {
    saveLeadFlow(map);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setEditingNodeId(null);
  };

  const allGaps = map.nodes.flatMap((n) => n.gaps);
  const uniqueGaps = [...new Set(allGaps)];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
      {/* Flow visual */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            Click a node to mark gaps. Gaps appear as colored flags.
          </div>
          <Button size="sm" onClick={handleSave}>{saved ? '✓ Saved' : 'Save Map'}</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
          {map.nodes.map((node, idx) => (
            <div key={node.id}>
              <Card
                style={{
                  cursor: 'pointer',
                  borderLeft: `4px solid ${node.gaps.length > 0 ? '#DC2626' : '#9CC9AA'}`,
                  padding: '12px 16px',
                  transition: 'box-shadow 0.15s',
                }}
                onClick={() => setEditingNodeId(editingNodeId === node.id ? null : node.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%', background: '#2F3C7E',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {idx + 1}
                      </span>
                      {editingNodeId === node.id ? (
                        <Input
                          value={node.label}
                          onChange={(e) => { updateNode(node.id, { label: e.target.value }); setSaved(false); }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 13, fontWeight: 600 }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{node.label}</span>
                      )}
                    </div>
                    {node.gaps.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 34 }}>
                        {node.gaps.map((gap) => (
                          <span key={gap} style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 3,
                            background: `${GAP_COLORS[gap]}20`,
                            color: GAP_COLORS[gap],
                            border: `1px solid ${GAP_COLORS[gap]}40`,
                            fontWeight: 600,
                          }}>
                            ⚠ {gap}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
                    {editingNodeId === node.id ? '▲ Close' : '▼ Mark Gaps'}
                  </span>
                </div>

                {editingNodeId === node.id && (
                  <div style={{ marginTop: 12, marginLeft: 34, borderTop: '1px solid #F3F4F6', paddingTop: 12 }}
                    onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>
                      Mark gaps at this step:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {LEAK_GAPS.map((gap) => {
                        const active = node.gaps.includes(gap);
                        return (
                          <button
                            key={gap}
                            onClick={() => toggleGap(node.id, gap)}
                            style={{
                              padding: '4px 10px', borderRadius: 4, fontSize: 11, fontFamily: 'inherit',
                              cursor: 'pointer', fontWeight: active ? 700 : 400,
                              background: active ? GAP_COLORS[gap] : '#F3F4F6',
                              color: active ? '#fff' : '#374151',
                              border: `1px solid ${active ? GAP_COLORS[gap] : '#E5E7EB'}`,
                            }}
                          >
                            {active ? '✓ ' : ''}{gap}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>

              {idx < map.nodes.length - 1 && (
                <div style={{
                  width: 2, height: 20, background: '#E5E7EB', margin: '0 auto',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', bottom: -4, left: -4,
                    width: 10, height: 10, borderRight: '2px solid #E5E7EB',
                    borderBottom: '2px solid #E5E7EB', transform: 'rotate(45deg)',
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <FormField label="Notes on Lead Flow">
            <Textarea
              value={map.notes}
              onChange={(e) => { setMap((prev) => ({ ...prev, notes: e.target.value })); setSaved(false); }}
              rows={3}
              placeholder="Additional context about the lead flow..."
            />
          </FormField>
        </div>
      </div>

      {/* Gap summary panel */}
      <div>
        <Card style={{ position: 'sticky', top: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 12 }}>Gap Summary</div>
          {uniqueGaps.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>
              No gaps marked yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {uniqueGaps.map((gap) => {
                const count = allGaps.filter((g) => g === gap).length;
                return (
                  <div key={gap} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderRadius: 6,
                    background: `${GAP_COLORS[gap]}15`,
                    border: `1px solid ${GAP_COLORS[gap]}30`,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: GAP_COLORS[gap] }}>{gap}</span>
                    <span style={{ fontSize: 11, color: GAP_COLORS[gap], fontWeight: 700 }}>×{count}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>
              Gaps at more than one node indicate systemic issues in the lead flow.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
