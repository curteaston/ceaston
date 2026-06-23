import { useState } from 'react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import Modal from './Modal.jsx';

const OUTCOMES = [
  ['connected', 'Connected'],
  ['voicemail', 'Left voicemail'],
  ['no answer', 'No answer'],
  ['gatekeeper', 'Gatekeeper'],
  ['booked meeting', 'Booked meeting'],
  ['not interested', 'Not interested'],
];

// Rendered once at the app root; opens whenever a PhoneLink with context is clicked.
export default function CallLogModal() {
  const { pendingCall, clearCall, run } = useStore();
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');

  if (!pendingCall) return null;

  const endBrowserCall = () => {
    try { pendingCall.twilioCall?.disconnect?.(); } catch { /* best effort */ }
    try { pendingCall.twilioDevice?.destroy?.(); } catch { /* best effort */ }
  };

  const close = () => {
    if (pendingCall.dialedViaTwilio) endBrowserCall();
    setOutcome('');
    setNote('');
    clearCall();
  };

  const save = () => {
    run(async () => {
      const body = [
        note || null,
        pendingCall.twilioCallSid ? `Twilio call SID: ${pendingCall.twilioCallSid}` : null,
      ].filter(Boolean).join('\n\n') || null;
      await api.post('/activities', {
        contact_id: pendingCall.contactId || null,
        company_id: pendingCall.companyId || null,
        type: 'call',
        outcome: outcome || null,
        body,
      });
      if (pendingCall.dialedViaTwilio) endBrowserCall();
      close();
    }, 'Call logged');
  };

  const who = pendingCall.contactName || pendingCall.companyName || pendingCall.phone;
  const statusText = pendingCall.dialedViaTwilio
    ? {
        authorizing: 'Checking call eligibility...',
        starting: 'Starting browser phone. Allow microphone access if prompted.',
        calling: `Calling ${pendingCall.phone} from this browser tab...`,
        connected: `Connected to ${pendingCall.phone}.`,
        ended: `Call ended. Log the outcome when ready.`,
        failed: `Browser call failed. Log any useful note or close this window.`,
      }[pendingCall.dialerState] || `Calling ${pendingCall.phone} from this browser tab...`
    : `Dialing ${pendingCall.phone}. How did it go?`;

  return (
    <Modal title={`Log call - ${who}`} onClose={close}>
      <p className="muted small">{statusText}</p>
      <div className="call-outcomes">
        {OUTCOMES.map(([val, label]) => (
          <button
            key={val}
            className={`call-outcome ${outcome === val ? 'on' : ''}`}
            onClick={() => setOutcome(val)}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        placeholder="Notes (optional)..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ marginTop: 10 }}
      />
      <div className="form-actions pad-top">
        {pendingCall.dialedViaTwilio && pendingCall.twilioCall && (
          <button className="btn danger" onClick={endBrowserCall}>End call</button>
        )}
        <button className="btn" onClick={close}>Skip</button>
        <button className="btn primary" onClick={save} disabled={!outcome && !note.trim()}>Log call</button>
      </div>
    </Modal>
  );
}
