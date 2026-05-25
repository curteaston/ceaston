import React, { useState, useMemo } from 'react';
import type { RevenueAssumptions, LeakageScorecard } from '../../types';
import { SCORECARD_CATEGORIES } from '../../types';
import { Card } from '../layout/Card';
import { Button } from '../layout/Button';
import { FormField, Input, Textarea } from '../layout/FormField';
import { saveRevenue, saveScorecard } from '../../utils/storage';
import { computeRevenue } from '../../utils/revenueCalc';

interface RevenueTabProps {
  prospectId: string;
  prospectAdSpend: number;
  initialRevenue: RevenueAssumptions | null;
  initialScorecard: LeakageScorecard | null;
  defaultSettings: { defaultAverageCPL: number; defaultFormEmailLeadPercentage: number; defaultCurrentAppointmentRate: number; defaultImprovedAppointmentRate: number; defaultCloseRate: number; defaultAverageTicket: number; defaultRecoveryPercentage: number };
}

function makeDefaultRevenue(prospectId: string, adSpend: number, s: RevenueTabProps['defaultSettings']): RevenueAssumptions {
  return {
    prospectId,
    estimatedMonthlyGoogleAdsSpend: adSpend || 0,
    averageCPL: s.defaultAverageCPL,
    estimatedTotalPaidLeads: Math.round(adSpend / s.defaultAverageCPL),
    formEmailLeadPercentage: s.defaultFormEmailLeadPercentage,
    estimatedMonthlyFormEmailLeads: Math.round((adSpend / s.defaultAverageCPL) * (s.defaultFormEmailLeadPercentage / 100)),
    currentFormToAppointmentRate: s.defaultCurrentAppointmentRate,
    improvedFormToAppointmentRate: s.defaultImprovedAppointmentRate,
    appointmentToCloseRate: s.defaultCloseRate,
    averageTicket: s.defaultAverageTicket,
    conservativeRecoveryPercentage: s.defaultRecoveryPercentage,
  };
}

function makeDefaultScorecard(prospectId: string): LeakageScorecard {
  const scores = {} as Record<string, number>;
  SCORECARD_CATEGORIES.forEach((c) => { scores[c] = 1; });
  return { prospectId, scores: scores as any, notes: '' };
}

function scoreSeverityLabel(total: number) {
  if (total <= 6) return { label: 'Low', color: '#059669', bg: '#D1FAE5' };
  if (total <= 12) return { label: 'Moderate', color: '#D97706', bg: '#FEF3C7' };
  if (total <= 17) return { label: 'High', color: '#DC2626', bg: '#FEE2E2' };
  return { label: 'Critical', color: '#7F1D1D', bg: '#FEE2E2' };
}

export function RevenueTab({ prospectId, prospectAdSpend, initialRevenue, initialScorecard, defaultSettings }: RevenueTabProps) {
  const [rev, setRev] = useState<RevenueAssumptions>(
    initialRevenue ?? makeDefaultRevenue(prospectId, prospectAdSpend, defaultSettings)
  );
  const [scorecard, setScorecard] = useState<LeakageScorecard>(
    initialScorecard ?? makeDefaultScorecard(prospectId)
  );
  const [saved, setSaved] = useState(false);

  const setR = (field: keyof RevenueAssumptions, value: number) =>
    setRev((prev) => ({ ...prev, [field]: value }));

  const output = useMemo(() => computeRevenue(rev), [rev]);

  const totalScore = useMemo(
    () => Object.values(scorecard.scores).reduce((a, b) => a + b, 0),
    [scorecard.scores]
  );

  const severity = scoreSeverityLabel(totalScore);

  const handleSave = () => {
    saveRevenue(rev);
    saveScorecard(scorecard);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const NumInput = ({ label, field, hint }: { label: string; field: keyof RevenueAssumptions; hint?: string }) => (
    <FormField label={label} hint={hint}>
      <Input
        type="number"
        value={rev[field] as number}
        onChange={(e) => { setR(field, Number(e.target.value)); setSaved(false); }}
        min={0}
      />
    </FormField>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Inputs */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 16 }}>Revenue Assumptions</div>
          <NumInput label="Est. Monthly Google Ads Spend ($)" field="estimatedMonthlyGoogleAdsSpend" />
          <NumInput label="Average Cost Per Lead ($)" field="averageCPL" />
          <NumInput label="Form/Email Lead Percentage (%)" field="formEmailLeadPercentage" hint="Of all paid leads, what % are form/email?" />
          <NumInput label="Current Form-to-Appointment Rate (%)" field="currentFormToAppointmentRate" />
          <NumInput label="Improved Form-to-Appointment Rate (%)" field="improvedFormToAppointmentRate" hint="Projected rate with RunWise" />
          <NumInput label="Appointment-to-Close Rate (%)" field="appointmentToCloseRate" />
          <NumInput label="Average Job Ticket ($)" field="averageTicket" />
          <NumInput label="Conservative Recovery (%)" field="conservativeRecoveryPercentage" hint="Applies a haircut to the projection" />
        </Card>

        {/* Outputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 16 }}>Revenue Exposure Estimate</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Est. Monthly Paid Leads', value: output.estimatedPaidLeads.toString() },
                { label: 'Est. Monthly Form/Email Leads', value: output.estimatedFormEmailLeads.toString() },
                { label: 'Current Booked Appointments', value: output.currentAppointments.toString() },
                { label: 'Projected Appointments (RunWise)', value: output.projectedAppointments.toString() },
                { label: 'Additional Appointments/Month', value: `+${output.additionalAppointments}` },
                { label: 'Additional Closed Jobs/Month', value: `+${output.additionalClosedJobs}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{value}</span>
                </div>
              ))}
              <div style={{ padding: '10px 12px', background: '#EEF2FF', borderRadius: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: '#2F3C7E', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Est. Monthly Revenue Exposure</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#2F3C7E' }}>${output.monthlyRevenueExposure.toLocaleString()}</div>
              </div>
              <div style={{ padding: '10px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Est. Annual Revenue Exposure</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#374151' }}>${output.annualRevenueExposure.toLocaleString()}</div>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '8px 10px', background: '#FEF3C7', borderRadius: 6, fontSize: 11, color: '#92400E', lineHeight: 1.4 }}>
              ⚠ These are directional estimates, not guarantees. Actual results depend on lead quality, business operations, and local market conditions.
            </div>
          </Card>
          <Button onClick={handleSave}>{saved ? '✓ Saved' : 'Save Estimates'}</Button>
        </div>
      </div>

      {/* Leakage Scorecard */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E' }}>Leakage Scorecard</div>
          <div style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: severity.bg, color: severity.color,
          }}>
            {severity.label} — {totalScore}/21
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 40px' }}>
          {SCORECARD_CATEGORIES.map((cat) => {
            const score = scorecard.scores[cat];
            return (
              <div key={cat} style={{ padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{cat}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: score <= 1 ? '#DC2626' : score === 2 ? '#D97706' : '#059669' }}>
                    {score}/3
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2, 3].map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        setScorecard((prev) => ({
                          ...prev,
                          scores: { ...prev.scores, [cat]: v },
                        }));
                        setSaved(false);
                      }}
                      style={{
                        width: 28, height: 28, borderRadius: 4, border: 'none',
                        cursor: 'pointer', fontWeight: 700, fontSize: 12,
                        fontFamily: 'inherit',
                        background: score === v
                          ? v === 0 ? '#DC2626' : v === 1 ? '#D97706' : v === 2 ? '#2563EB' : '#059669'
                          : '#F3F4F6',
                        color: score === v ? '#fff' : '#9CA3AF',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                  <span style={{ fontSize: 10, color: '#9CA3AF', alignSelf: 'center', marginLeft: 4 }}>
                    {score === 0 ? 'Critical' : score === 1 ? 'Weak' : score === 2 ? 'Moderate' : 'Strong'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16 }}>
          <FormField label="Scorecard Notes">
            <Textarea
              value={scorecard.notes}
              onChange={(e) => { setScorecard((prev) => ({ ...prev, notes: e.target.value })); setSaved(false); }}
              rows={2}
              placeholder="Add context about the scores..."
            />
          </FormField>
        </div>

        <div style={{ marginTop: 8, padding: '8px 12px', background: '#F9FAFB', borderRadius: 6, fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>
          Score 0–6: Low severity | 7–12: Moderate | 13–17: High | 18–21: Critical
        </div>
      </Card>
    </div>
  );
}
