import React, { useState } from 'react';
import type { AppSettings, ReportTone } from '../../types';
import { Header } from '../layout/Header';
import { Card } from '../layout/Card';
import { Button } from '../layout/Button';
import { FormField, Input, Textarea, Select } from '../layout/FormField';
import { saveSettings, resetStorage } from '../../utils/storage';

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

export function SettingsPage({ settings, onSettingsChange }: SettingsPageProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  const set = (field: keyof AppSettings, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(form);
    onSettingsChange(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (!confirm('This will reset ALL app data to defaults, including all prospects and audit data. Are you sure?')) return;
    resetStorage();
    window.location.reload();
  };

  const NumField = ({ label, field, hint }: { label: string; field: keyof AppSettings; hint?: string }) => (
    <FormField label={label} hint={hint}>
      <Input
        type="number"
        value={form[field] as number}
        onChange={(e) => set(field, Number(e.target.value))}
      />
    </FormField>
  );

  return (
    <div>
      <Header title="Settings" subtitle="Default assumptions and app configuration" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 16 }}>
            Default Revenue Assumptions
          </div>
          <NumField label="Average Cost Per Lead ($)" field="defaultAverageCPL" hint="Used when building new revenue estimates" />
          <NumField label="Form/Email Lead Percentage (%)" field="defaultFormEmailLeadPercentage" />
          <NumField label="Current Appointment Rate (%)" field="defaultCurrentAppointmentRate" />
          <NumField label="Improved Appointment Rate (%)" field="defaultImprovedAppointmentRate" hint="Projected rate with RunWise" />
          <NumField label="Appointment-to-Close Rate (%)" field="defaultCloseRate" />
          <NumField label="Average Job Ticket ($)" field="defaultAverageTicket" />
          <NumField label="Conservative Recovery (%)" field="defaultRecoveryPercentage" />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2F3C7E', marginBottom: 16 }}>
              Default Report Settings
            </div>
            <FormField label="Default Report Tone">
              <Select value={form.defaultReportTone} onChange={(e) => set('defaultReportTone', e.target.value as ReportTone)}>
                <option>Conservative</option>
                <option>Revenue-Focused</option>
                <option>Boardroom / Professional</option>
              </Select>
            </FormField>
            <FormField label="Default Pilot Offer Wording">
              <Textarea
                value={form.defaultPilotOfferWording}
                onChange={(e) => set('defaultPilotOfferWording', e.target.value)}
                rows={5}
              />
            </FormField>
          </Card>

          <Card style={{ border: '1px solid #FEE2E2', background: '#FEF2F2' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 8 }}>Data & Storage</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 12 }}>
              <strong>⚠ Prototype Warning:</strong> This app uses local browser storage only. Do not enter real customer data unless this app is secured with authentication and a private backend. Data is stored only in this browser and will be cleared if you clear browser data.
            </div>
            <Button variant="danger" onClick={handleReset} size="sm">
              Reset All App Data
            </Button>
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 20, maxWidth: 900 }}>
        <Button onClick={handleSave}>
          {saved ? '✓ Settings Saved' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
