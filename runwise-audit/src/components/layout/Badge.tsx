import React from 'react';
import type { PipelineStage, AuditStatus, TestOutcome } from '../../types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: '#EEF2FF', color: '#2F3C7E' },
  success: { background: '#D1FAE5', color: '#065F46' },
  warning: { background: '#FEF3C7', color: '#92400E' },
  danger: { background: '#FEE2E2', color: '#991B1B' },
  info: { background: '#DBEAFE', color: '#1E40AF' },
  neutral: { background: '#F3F4F6', color: '#374151' },
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <span style={{
      ...style,
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 4,
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export function StageBadge({ stage }: { stage: PipelineStage }) {
  const variant: BadgeVariant =
    stage === 'Pilot Won' ? 'success' :
    stage === 'Disqualified' ? 'danger' :
    stage === 'Not Now / Nurture' ? 'neutral' :
    stage === '14-Day Fix Proposed' || stage === 'Findings Presented' ? 'warning' :
    stage === 'Findings Call Scheduled' || stage === 'Report Drafted' ? 'info' :
    'default';

  return <Badge label={stage} variant={variant} />;
}

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const map: Record<AuditStatus, { label: string; variant: BadgeVariant }> = {
    not_started: { label: 'Not Started', variant: 'neutral' },
    in_progress: { label: 'In Progress', variant: 'warning' },
    complete: { label: 'Complete', variant: 'success' },
  };
  const { label, variant } = map[status];
  return <Badge label={label} variant={variant} />;
}

export function TestOutcomeBadge({ outcome }: { outcome: TestOutcome | '' }) {
  if (!outcome) return <Badge label="Pending" variant="neutral" />;
  const map: Record<TestOutcome, BadgeVariant> = {
    Strong: 'success',
    Moderate: 'info',
    Weak: 'warning',
    'Critical leak': 'danger',
    Inconclusive: 'neutral',
  };
  return <Badge label={outcome} variant={map[outcome]} />;
}
