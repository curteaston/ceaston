import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './components/dashboard/Dashboard';
import { ProspectsPage } from './components/prospects/ProspectsPage';
import { AuditWorkspace } from './components/audit/AuditWorkspace';
import { ReportsPage } from './components/reports/ReportsPage';
import { FollowUpsPage } from './components/followups/FollowUpsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import type { Prospect, AppSettings, AuditReport, FollowUpTask } from './types';
import {
  initializeStorage, getProspects, saveProspects,
  getAllReports, getFollowUps, getSettings,
} from './utils/storage';

type Page = 'dashboard' | 'prospects' | 'audit' | 'reports' | 'followups' | 'settings';

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [reports, setReports] = useState<Record<string, AuditReport>>({});
  const [followUps, setFollowUps] = useState<FollowUpTask[]>([]);
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  useEffect(() => {
    initializeStorage();
    setProspects(getProspects());
    setReports(getAllReports());
    setFollowUps(getFollowUps());
    setSettings(getSettings());
    setInitialized(true);
  }, []);

  const handleNavigate = (navPage: string, prospectId?: string) => {
    if (navPage === 'audit' && prospectId) {
      setSelectedProspectId(prospectId);
      setPage('audit');
    } else {
      setPage(navPage as Page);
      if (navPage !== 'audit') setSelectedProspectId(null);
    }
  };

  const handleSaveProspect = (p: Prospect) => {
    const all = getProspects();
    const exists = all.find((x) => x.id === p.id);
    const updated = exists ? all.map((x) => (x.id === p.id ? p : x)) : [...all, p];
    saveProspects(updated);
    setProspects(updated);
  };

  const handleOpenProspect = (id: string) => {
    setSelectedProspectId(id);
    setPage('audit');
  };

  const handleReportsChange = () => {
    setReports(getAllReports());
  };

  const handleFollowUpsChange = (tasks: FollowUpTask[]) => {
    setFollowUps(tasks);
  };

  const handleSettingsChange = (s: AppSettings) => {
    setSettings(s);
  };

  if (!initialized) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: '#9CA3AF', fontSize: 14,
      }}>
        Loading RunWise Audit Builder...
      </div>
    );
  }

  const selectedProspect = selectedProspectId
    ? prospects.find((p) => p.id === selectedProspectId)
    : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F9FAFC' }}>
      <Sidebar active={page} onNavigate={handleNavigate} />

      <div style={{ marginLeft: 220, flex: 1, padding: '32px 36px', maxWidth: 'calc(100vw - 220px)' }}>
        {/* Internal use only banner */}
        <div className="no-print" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24, padding: '8px 14px',
          background: '#EEF2FF', border: '1px solid #C7D2FE',
          borderRadius: 8, fontSize: 12,
        }}>
          <span style={{ color: '#2F3C7E', fontWeight: 500 }}>
            RunWise Systems Internal Tool
          </span>
          <span style={{
            background: '#2F3C7E', color: '#F4C95D', fontSize: 10,
            fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            letterSpacing: 1, textTransform: 'uppercase',
          }}>
            Internal Use Only
          </span>
        </div>

        {page === 'dashboard' && (
          <Dashboard
            prospects={prospects}
            followUps={followUps}
            reports={reports}
            onNavigate={handleNavigate}
          />
        )}

        {page === 'prospects' && (
          <ProspectsPage
            prospects={prospects}
            onSave={handleSaveProspect}
            onOpen={handleOpenProspect}
          />
        )}

        {page === 'audit' && selectedProspect && (
          <AuditWorkspace
            key={selectedProspect.id}
            prospect={selectedProspect}
            onProspectUpdate={(p) => {
              handleSaveProspect(p);
              handleReportsChange();
            }}
            onBack={() => setPage('prospects')}
            settings={settings}
          />
        )}

        {page === 'audit' && !selectedProspect && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9CA3AF' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>◉</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
              No prospect selected
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              Open a prospect from the Prospects page to start an audit.
            </div>
            <button
              onClick={() => setPage('prospects')}
              style={{
                background: '#2F3C7E', color: '#fff', border: 'none', borderRadius: 7,
                padding: '8px 16px', fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Go to Prospects
            </button>
          </div>
        )}

        {page === 'reports' && (
          <ReportsPage
            prospects={prospects}
            reports={reports}
            onOpenProspect={handleOpenProspect}
          />
        )}

        {page === 'followups' && (
          <FollowUpsPage
            followUps={followUps}
            prospects={prospects}
            reports={reports}
            onFollowUpsChange={handleFollowUpsChange}
            onOpenProspect={handleOpenProspect}
          />
        )}

        {page === 'settings' && (
          <SettingsPage
            settings={settings}
            onSettingsChange={handleSettingsChange}
          />
        )}
      </div>
    </div>
  );
}
