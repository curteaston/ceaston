import React, { useState } from 'react';
import type { FollowUpTask, PipelineStage } from '../../types';
import { Card } from '../layout/Card';
import { Button } from '../layout/Button';
import { StageBadge } from '../layout/Badge';
import { FormField, Input, Textarea } from '../layout/FormField';
import { getFollowUps, saveFollowUps } from '../../utils/storage';

interface FollowUpNotesTabProps {
  prospectId: string;
  prospectName: string;
  stage: PipelineStage;
}

export function FollowUpNotesTab({ prospectId, prospectName, stage }: FollowUpNotesTabProps) {
  const [tasks, setTasks] = useState<FollowUpTask[]>(() =>
    getFollowUps().filter((t) => t.prospectId === prospectId)
  );
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<FollowUpTask>>({ action: '', dueDate: '', notes: '' });

  const persistAll = (updated: FollowUpTask[]) => {
    const all = getFollowUps();
    const others = all.filter((t) => t.prospectId !== prospectId);
    saveFollowUps([...others, ...updated]);
    setTasks(updated);
  };

  const handleAdd = () => {
    if (!draft.action?.trim()) return;
    const task: FollowUpTask = {
      id: `fu${Date.now()}`,
      prospectId,
      prospectName,
      stage,
      action: draft.action ?? '',
      dueDate: draft.dueDate ?? '',
      notes: draft.notes ?? '',
      completed: false,
      createdAt: new Date().toISOString(),
    };
    persistAll([...tasks, task]);
    setDraft({ action: '', dueDate: '', notes: '' });
    setIsAdding(false);
  };

  const toggleComplete = (id: string) => {
    persistAll(tasks.map((t) => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    persistAll(tasks.filter((t) => t.id !== id));
  };

  const today = new Date().toISOString().split('T')[0];
  const open = tasks.filter((t) => !t.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = tasks.filter((t) => t.completed);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          {open.length} open · {done.length} completed
        </div>
        <Button size="sm" onClick={() => setIsAdding(true)}>+ Add Follow-Up</Button>
      </div>

      {isAdding && (
        <Card style={{ marginBottom: 16, background: '#F9FAFB', border: '1px solid #2F3C7E' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 12 }}>New Follow-Up</div>
          <FormField label="Action Required" required>
            <Input
              value={draft.action}
              onChange={(e) => setDraft((p) => ({ ...p, action: e.target.value }))}
              placeholder="What needs to happen?"
              autoFocus
            />
          </FormField>
          <FormField label="Due Date">
            <Input type="date" value={draft.dueDate} onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))} />
          </FormField>
          <FormField label="Notes">
            <Textarea value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} rows={2} />
          </FormField>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={handleAdd}>Add Task</Button>
            <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {open.length === 0 && !isAdding && (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF' }}>
            <div style={{ fontSize: 13 }}>No open follow-ups for this prospect.</div>
            <Button size="sm" onClick={() => setIsAdding(true)} style={{ marginTop: 12 }}>+ Add Follow-Up</Button>
          </div>
        </Card>
      )}

      {open.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {open.map((task) => {
            const overdue = task.dueDate && task.dueDate < today;
            return (
              <Card key={task.id} style={{
                padding: '12px 16px',
                borderLeft: `4px solid ${overdue ? '#DC2626' : '#2F3C7E'}`,
                background: overdue ? '#FEF2F2' : '#fff',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleComplete(task.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{task.action}</span>
                      {overdue && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: '#FEE2E2', color: '#991B1B', fontWeight: 700 }}>
                          OVERDUE
                        </span>
                      )}
                    </div>
                    {task.dueDate && (
                      <div style={{ fontSize: 12, color: overdue ? '#DC2626' : '#6B7280', marginTop: 4, marginLeft: 22 }}>
                        Due: {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                    {task.notes && (
                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, marginLeft: 22, lineHeight: 1.4 }}>
                        {task.notes}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteTask(task.id)}>×</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 8 }}>Completed</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {done.map((task) => (
              <Card key={task.id} style={{ padding: '10px 16px', opacity: 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={task.completed} onChange={() => toggleComplete(task.id)} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: '#6B7280', textDecoration: 'line-through' }}>{task.action}</span>
                  <Button size="sm" variant="ghost" onClick={() => deleteTask(task.id)} style={{ marginLeft: 'auto' }}>×</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
