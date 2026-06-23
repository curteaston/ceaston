import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useStore } from '../store.js';
import { isOverdue, fmtDate } from '../format.js';

export function CompanySelect({ value, onChange, required = true }) {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    api.get(`/companies${qs({ sort: 'name', order: 'asc', limit: 500 })}`)
      .then((d) => setCompanies(d.companies))
      .catch(() => {});
  }, []);
  return (
    <select required={required} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a company…</option>
      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

// Click-to-call link: dials via the OS handler (mobile, Teams, Google Voice, RingCentral, …)
// and, when contact/company context is given, pops the quick call-log dialog.
export function PhoneLink({ phone, contactId, companyId, contactName, companyName }) {
  const dialerStatus = useStore((s) => s.dialerStatus);
  const startCall = useStore((s) => s.startCall);
  const clearCall = useStore((s) => s.clearCall);
  const notify = useStore((s) => s.notify);
  if (!phone) return <span className="muted">--</span>;
  const href = `tel:${phone.replace(/[^+\d]/g, '')}`;
  const callContext = { phone, contactId, companyId, contactName, companyName };
  const onClick = async (e) => {
    e.stopPropagation();
    if (!contactId && !companyId) return;

    if (!dialerStatus?.configured) {
      startCall(callContext);
      return;
    }

    e.preventDefault();
    startCall({ ...callContext, dialedViaTwilio: true, dialerState: 'authorizing' });
    try {
      const auth = await api.post('/dialer/authorize-call', {
        phone,
        contact_id: contactId || null,
        company_id: companyId || null,
      });
      startCall({ ...callContext, dialedViaTwilio: true, dialerState: 'starting' });
      const token = await api.post('/dialer/token');
      const { Device } = await import('@twilio/voice-sdk');
      const device = new Device(token.token, { logLevel: 1 });
      const twilioCall = await device.connect({
        params: { To: auth.phone, CallToken: auth.dial_token },
      });

      const updateCall = (patch) => {
        const current = useStore.getState().pendingCall;
        if (!current || current.phone !== phone) return;
        useStore.getState().startCall({ ...current, ...patch });
      };
      twilioCall.on('accept', () => updateCall({ dialerState: 'connected', twilioCallSid: twilioCall.parameters?.CallSid || null }));
      twilioCall.on('disconnect', () => {
        updateCall({ dialerState: 'ended', twilioCall: null, twilioDevice: null });
        device.destroy();
      });
      twilioCall.on('cancel', () => {
        updateCall({ dialerState: 'ended', twilioCall: null, twilioDevice: null });
        device.destroy();
      });
      twilioCall.on('reject', () => {
        updateCall({ dialerState: 'ended', twilioCall: null, twilioDevice: null });
        device.destroy();
      });
      twilioCall.on('error', (err) => {
        updateCall({ dialerState: 'failed', twilioCall: null, twilioDevice: null });
        notify(err.message || 'Twilio browser call failed', true);
        device.destroy();
      });

      startCall({
        ...callContext,
        dialedViaTwilio: true,
        dialerState: 'calling',
        twilioCall,
        twilioDevice: device,
      });
      notify('Browser call started. Allow microphone access if prompted.');
    } catch (err) {
      clearCall();
      notify(err.message, true);
    }
  };
  return (
    <a href={href} className="phone-link" title={dialerStatus?.configured ? `Call ${phone} from browser` : `Call ${phone}`} onClick={onClick}>
      📞 {phone}
    </a>
  );
}

export function StageChip({ stage }) {
  if (!stage) return <span className="muted">—</span>;
  return <span className={`chip stage stage-${stage}`}>{stage}</span>;
}

export function PriorityChip({ priority }) {
  return <span className={`chip prio prio-${priority}`}>{priority}</span>;
}

export function TaskRow({ task, onToggle, onDelete, showTarget = false }) {
  return (
    <div className={`task-row ${task.completed ? 'done' : ''}`}>
      <input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} />
      <div className="task-main">
        <div className="task-desc">{task.description}</div>
        <div className="task-meta">
          <span className={isOverdue(task) ? 'overdue' : ''}>
            {task.due_date ? fmtDate(task.due_date) : 'No due date'}
          </span>
          <PriorityChip priority={task.priority} />
          {task.owner && <span className="muted">@{task.owner}</span>}
          {showTarget && (task.contact_name || task.company_name) && (
            <span className="muted">· {task.contact_name || task.company_name}</span>
          )}
        </div>
      </div>
      {onDelete && (
        <button className="icon-btn" title="Delete task" onClick={() => onDelete(task)}>✕</button>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
