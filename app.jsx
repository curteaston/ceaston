/* eslint-disable */
const { useState, useEffect, useRef, useMemo } = React;
const {
  IconPhone, IconBolt, IconCheckCircle, IconCheck, IconCalendar, IconAlert,
  IconShield, IconClipboard, IconChart, IconRoute, IconHvac, IconSnow,
  IconFlame, IconWrench, IconTruck, IconTool, IconUser, IconArrow, IconPlus,
  IconClock, IconMic
} = window.Icons;

/* =========================================================
   NAV
========================================================= */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);
  const close = () => setMenuOpen(false);
  return (
    <div className={`nav-wrap ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav">
        <a href="#top" className="nav-logo" aria-label="RunWise Systems" onClick={close}>
          <img src="assets/logo.png" alt="RunWise Systems" />
        </a>
        <nav className="nav-links">
          <a href="#what">What it does</a>
          <a href="#how">How it works</a>
          <a href="#pilot">Pilot</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav-cta">
          <a href="#challenge" className="btn btn-ghost btn-sm">See the demo</a>
          <a href="#audit" className="btn btn-primary btn-sm">Get the audit</a>
        </div>
        <button
          className={`nav-burger ${menuOpen ? 'open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}
        >
          <span /><span /><span />
        </button>
      </div>
      <div className={`mobile-menu ${menuOpen ? 'open' : ''}`} onClick={close}>
        <div className="mobile-menu-inner" onClick={e => e.stopPropagation()}>
          <a href="#what" onClick={close}>What it does</a>
          <a href="#how" onClick={close}>How it works</a>
          <a href="#pilot" onClick={close}>Pilot</a>
          <a href="#faq" onClick={close}>FAQ</a>
          <div className="mobile-menu-cta">
            <a href="#challenge" className="btn btn-ghost" onClick={close}>See the demo</a>
            <a href="#audit" className="btn btn-primary" onClick={close}>Get the audit</a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   HERO — Animated live-call card
========================================================= */
const transcriptLines = [
  { who: 'RunWise', ai: true,  text: "Hi, this is Alex with Pioneer Heating & Air, calling back about your AC request. Is now a good time?" },
  { who: 'Caller',  ai: false, text: "Yeah — it stopped cooling around noon. House is at 84." },
  { who: 'RunWise', ai: true,  text: "Sorry about that. I can get a tech out today. Are you the homeowner, and is this for a single‑family home?" },
  { who: 'Caller',  ai: false, text: "Homeowner, yes. Single family." },
  { who: 'RunWise', ai: true,  text: "Got it. I have an arrival window between 2pm and 4pm today. Want me to lock that in?" },
];

function LiveCallCard() {
  const [step, setStep] = useState(1);
  const [timer, setTimer] = useState(12);
  useEffect(() => {
    const i = setInterval(() => {
      setStep(s => (s >= transcriptLines.length ? 1 : s + 1));
      setTimer(t => (t >= 95 ? 12 : t + 18));
    }, 2600);
    return () => clearInterval(i);
  }, []);
  const visible = transcriptLines.slice(0, step);
  const mm = String(Math.floor(timer / 60)).padStart(2, '0');
  const ss = String(timer % 60).padStart(2, '0');

  return (
    <div className="hero-preview-frame">
      <div className="hero-preview-chrome">
        <span className="dot" /><span className="dot" /><span className="dot" />
        <span className="url">runwise.app/calls/live</span>
      </div>
      <div className="live-call">
        <div className="live-call-head">
          <span className="live-badge"><span className="live-pulse" />Live call · qualifying</span>
          <span className="call-timer">{mm}:{ss}</span>
        </div>
        <div className="lead-row">
          <div className="lead-avatar">MR</div>
          <div className="lead-meta">
            <div className="lead-name">Maria Reyes &nbsp;·&nbsp; AC not cooling</div>
            <div className="lead-sub">GHL form · arrived 00:09 ago</div>
          </div>
          <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
            <IconPhone size={18} />
          </span>
        </div>

        <div className="transcript">
          {visible.map((l, i) => (
            <div key={i} className="t-line">
              <div className={`t-who ${l.ai ? 'ai' : ''}`}>{l.who}</div>
              <div className="t-text">
                {l.text}
                {i === visible.length - 1 && <span className="cursor" />}
              </div>
            </div>
          ))}
        </div>

        <div className="call-actions">
          <div className="pill">
            <IconBolt className="ic" /> <span>Urgency&nbsp;·&nbsp;<strong>Same‑day</strong></span>
          </div>
          <div className="pill">
            <IconWrench className="ic" /> <span>Type&nbsp;·&nbsp;<strong>AC repair</strong></span>
          </div>
          <div className="pill">
            <IconShield className="ic" /> <span>Safety&nbsp;·&nbsp;<strong>Clear</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <div>
          <div className="eyebrow"><span className="dot" />AI speed‑to‑lead for HVAC</div>
          <h1 className="h1">
            Call new HVAC leads{' '}
            <span style={{ color: 'var(--gold-600)' }}>in under 30&nbsp;seconds.</span>
          </h1>
          <div style={{ height: 22 }} />
          <p className="lede">
            RunWise calls new HVAC leads fast, qualifies the request, books arrival windows when possible,
            and alerts your team when a dispatcher needs to step in.
          </p>
          <div className="hero-cta">
            <a href="#audit" className="btn btn-primary">Request a 48-Hour Audit <IconArrow size={16} /></a>
            <a href="#challenge" className="btn btn-ghost">
              <IconBolt size={15} /> See the 30-second callback demo
            </a>
          </div>
          <div className="hero-support">
            {[
              'Calls new leads quickly',
              'Books arrival windows when available',
              'Escalates urgent & safety calls',
              'Logs every call, recording, and outcome',
            ].map((t) => (
              <div className="hero-support-item" key={t}>
                <span className="check"><IconCheck size={11} /></span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-preview">
          <LiveCallCard />
          <div className="float-card booking">
            <div className="ic-wrap"><IconCalendar size={15} /></div>
            <div>
              <div className="label">Arrival booked</div>
              <div className="val">Today · 2–4pm</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   TRUST STRIP
========================================================= */
function TrustStrip() {
  return (
    <div className="trust-strip">
      <div className="container trust-strip-inner">
        <span className="trust-label">Built for HVAC operators</span>
        <div className="trust-stats">
          <div className="trust-stat"><span className="n">&lt; 30s</span><span className="l">Typical first‑touch on inbound leads</span></div>
          <div className="trust-stat"><span className="n">24/7</span><span className="l">After‑hours & overflow coverage</span></div>
          <div className="trust-stat"><span className="n">5+</span><span className="l">Lead sources connected per account</span></div>
          <div className="trust-stat"><span className="n">100%</span><span className="l">Calls logged with recording & notes</span></div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PROBLEM
========================================================= */
function Problem() {
  const [animated, setAnimated] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const ob = new IntersectionObserver(([e]) => e.isIntersecting && setAnimated(true), { threshold: 0.3 });
    if (ref.current) ob.observe(ref.current);
    return () => ob.disconnect();
  }, []);

  return (
    <section className="section" id="problem">
      <div className="container problem-grid">
        <div>
          <div className="eyebrow"><span className="dot" />The problem</div>
          <h2 className="h2">Most HVAC leads do not wait around.</h2>
          <div style={{ height: 20 }} />
          <p className="lede">
            When a homeowner submits a form, they are usually still shopping. If they do not hear back quickly,
            they may call the next contractor. RunWise helps protect expensive leads by responding while the
            customer is still engaged.
          </p>
          <div className="pain-list">
            <div className="pain">
              <span className="pain-num">01</span>
              <span className="pain-text">
                <strong>Missed form leads</strong> after hours or during busy dispatch periods.
              </span>
            </div>
            <div className="pain">
              <span className="pain-num">02</span>
              <span className="pain-text">
                <strong>Slow callback times</strong> on paid leads — by the time you call, they've already booked someone.
              </span>
            </div>
            <div className="pain">
              <span className="pain-num">03</span>
              <span className="pain-text">
                <strong>Dispatchers stuck chasing leads</strong> instead of handling booked work and existing customers.
              </span>
            </div>
          </div>
        </div>

        <div className="speed-viz" ref={ref}>
          <div className="speed-title">
            <h4>Speed‑to‑lead, by responder</h4>
            <span className="tag">Avg. first contact</span>
          </div>
          <div className="speed-bars">
            <div className="speed-bar runwise">
              <span className="who"><strong>RunWise</strong></span>
              <div className="track"><div className="fill" style={{ width: animated ? '6%' : '0%' }} /></div>
              <span className="val">&lt; 60s</span>
            </div>
            <div className="speed-bar you">
              <span className="who"><strong>Fast contractor</strong></span>
              <div className="track"><div className="fill" style={{ width: animated ? '32%' : '0%' }} /></div>
              <span className="val">5 min</span>
            </div>
            <div className="speed-bar typical">
              <span className="who">Typical shop</span>
              <div className="track"><div className="fill" style={{ width: animated ? '68%' : '0%' }} /></div>
              <span className="val">47 min</span>
            </div>
            <div className="speed-bar afterhours">
              <span className="who">After hours</span>
              <div className="track"><div className="fill" style={{ width: animated ? '100%' : '0%' }} /></div>
              <span className="val">Next day</span>
            </div>
          </div>
          <div className="speed-foot">Illustrative response-time comparison</div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   FEATURES — What RunWise Does
========================================================= */
const features = [
  { ic: <IconPhone size={18} />,     title: 'Instant Lead Follow‑Up',  body: 'Calls new leads quickly after they submit a form or inbound request, while the homeowner is still engaged.', tag: 'Speed‑to‑lead' },
  { ic: <IconMic size={18} />,        title: 'Smart Qualification',     body: 'Identifies service type, urgency, safety concerns, and customer intent — in plain conversation.',          tag: 'Conversation' },
  { ic: <IconCalendar size={18} />,   title: 'Appointment Booking',     body: 'Offers real arrival windows when calendar access is available. No exact‑time promises you can\u2019t keep.', tag: 'Booked work' },
  { ic: <IconRoute size={18} />,      title: 'Dispatcher Handoff',      body: 'Routes urgent, safety, or unclear calls to a human — and pushes booked jobs to your FSM via API, Zapier, Make, calendar, or booking link, depending on access.', tag: 'Routing' },
  { ic: <IconClipboard size={18} />,  title: 'Call Log & Lead Record',  body: 'Every call lands in your RunWise/GHL workspace with outcome, transcript, recording, and notes — a complete record of how each lead was handled.', tag: 'Source of truth' },
  { ic: <IconChart size={18} />,      title: 'Owner Reporting',         body: 'Visibility into calls made, booked appointments, no‑answers, and review‑needed leads.',                     tag: 'Reporting' },
];

function Features() {
  return (
    <section className="section features" id="what">
      <div className="container">
        <div className="feature-head">
          <div>
            <div className="eyebrow"><span className="dot" />What RunWise does</div>
            <h2 className="h2">Your AI speed‑to‑lead assistant for HVAC.</h2>
          </div>
          <p className="lede">
            Six things RunWise handles end‑to‑end, so your dispatcher can focus on booked work
            instead of chasing fresh leads.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((f, i) => (
            <div className="feature" key={i}>
              <div className="feature-ic">{f.ic}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <span className="feature-tag">{f.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   HOW IT WORKS
========================================================= */
function HowItWorks() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setActive(a => (a + 1) % 4), 2200);
    return () => clearInterval(i);
  }, []);
  const steps = [
    { t: 'Lead comes in',          d: 'Form, email, GHL, or call — RunWise picks it up the moment it lands.' },
    { t: 'RunWise calls the lead', d: 'Within seconds. The homeowner is still in front of their phone.' },
    { t: 'AI qualifies & books',   d: 'Service type, urgency, safety check, arrival window — or escalation.' },
    { t: 'Your team sees the outcome', d: 'Logged with transcript and recording. Booked jobs handed off to your FSM where access allows; review‑needed leads flagged for a human.' },
  ];
  return (
    <section className="section how" id="how">
      <div className="container how-inner">
        <div style={{ maxWidth: 640 }}>
          <div className="eyebrow on-dark"><span className="dot" />How it works</div>
          <h2 className="h2" style={{ color: 'white' }}>Four steps from inbound form to booked job.</h2>
        </div>
        <div className="how-steps">
          <div className="how-line" />
          {steps.map((s, i) => (
            <div className={`how-step ${active === i ? 'active' : ''}`} key={i}>
              <div className="how-step-num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{s.t}</h4>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   BUILT FOR HVAC
========================================================= */
function BuiltForHVAC() {
  const items = [
    { ic: <IconSnow size={16} />,   label: 'Cooling repair' },
    { ic: <IconFlame size={16} />,  label: 'Heating repair' },
    { ic: <IconTool size={16} />,   label: 'Maintenance & tune‑ups' },
    { ic: <IconHvac size={16} />,   label: 'Replacement estimates' },
    { ic: <IconBolt size={16} />,   label: 'No‑cooling / no‑heat',  cls: 'urgent' },
    { ic: <IconAlert size={16} />,  label: 'Safety concerns',       cls: 'safety' },
    { ic: <IconUser size={16} />,   label: 'Dispatcher review' },
    { ic: <IconTruck size={16} />,  label: 'Truck routing handoff' },
  ];
  return (
    <section className="section hvac" id="hvac">
      <div className="container hvac-grid">
        <div>
          <div className="eyebrow"><span className="dot" />Built for HVAC</div>
          <h2 className="h2">Built around real HVAC workflows.</h2>
          <div style={{ height: 18 }} />
          <p className="lede">
            RunWise speaks contractor — not generic SaaS. Call flows are tuned for the way HVAC shops
            actually triage, book, and escalate.
          </p>
          <div className="hvac-note">
            <strong>Arrival windows, not exact times.</strong> RunWise commits to realistic windows your
            techs can hit — not promises that blow up your reputation.
          </div>
        </div>
        <div className="hvac-chips">
          {items.map((it, i) => (
            <div className={`hvac-chip ${it.cls || ''}`} key={i}>
              <span className="ic">{it.ic}</span>
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   ROI
========================================================= */
function Roi() {
  const [leads, setLeads] = useState(50);
  const [recoverPct, setRecoverPct] = useState(15);
  const [closeRate, setCloseRate] = useState(30);
  const [gp, setGp] = useState(450);

  const bookedAppts = leads * recoverPct / 100;
  const closedJobs = Math.round(bookedAppts * closeRate / 100);
  const monthly = closedJobs * gp;
  const annual = monthly * 12;

  return (
    <section className="section roi" id="roi">
      <div className="container roi-grid">
        <div>
          <div className="eyebrow"><span className="dot" />ROI</div>
          <h2 className="h2">Designed to pay for itself by recovering opportunities.</h2>
          <div style={{ height: 20 }} />
          <p className="lede">
            RunWise is priced around recovered opportunity value, not AI novelty. If faster response
            helps recover a few jobs each month that would have otherwise gone cold, the system can
            become an obvious operational win.
          </p>
          <p className="lede" style={{ marginTop: 16, fontSize: 15 }}>
            We model the math on <strong style={{ color: 'var(--ink)' }}>gross profit</strong> — not revenue —
            and we don't guarantee outcomes. Use the calculator as a sanity check, not a quote.
          </p>
        </div>

        <div className="roi-calc">
          <h4>Recovery sanity check</h4>
          <div className="sub">Tune the inputs to your shop</div>

          <div className="roi-row">
            <label>Monthly inbound leads</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min="10" max="500" step="5" value={leads}
                     onChange={e => setLeads(+e.target.value)} className="roi-slider" />
              <span className="num">{leads}</span>
            </div>
          </div>
          <div className="roi-row">
            <label>Booking lift from RunWise</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min="2" max="50" step="1" value={recoverPct}
                     onChange={e => setRecoverPct(+e.target.value)} className="roi-slider" />
              <span className="num">{recoverPct}%</span>
            </div>
          </div>
          <div className="roi-row">
            <label>Your close rate</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min="10" max="60" step="1" value={closeRate}
                     onChange={e => setCloseRate(+e.target.value)} className="roi-slider" />
              <span className="num">{closeRate}%</span>
            </div>
          </div>
          <div className="roi-row">
            <label>Avg. gross profit per recovered job</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min="150" max="2000" step="50" value={gp}
                     onChange={e => setGp(+e.target.value)} className="roi-slider" />
              <span className="num">${gp}</span>
            </div>
          </div>

          <div className="roi-out">
            <div>
              <div className="lbl">Recovered GP</div>
              <div className="lbl-sub">{Math.round(bookedAppts)} appts &rarr; {closedJobs} jobs/mo &middot; illustrative</div>
            </div>
            <div className="val">${monthly.toLocaleString()}<span style={{ fontSize: 14, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)', marginLeft: 6 }}>/mo</span></div>
          </div>
          <div className="roi-disclaimer">
            Illustrative only. Real results depend on lead quality, close rates, ticket size, and how
            well RunWise is tuned to your dispatch process. Annualized: ${annual.toLocaleString()}.
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   PILOT
========================================================= */
function Pilot() {
  const checks = [
    'Audit findings identify the highest-impact response gap',
    'RunWise is set up around your lead sources, your availability, and how you book jobs',
    'Calls are live — every interaction logged, recorded, and reviewed with you',
    'We tune before you decide anything about expanding',
  ];
  return (
    <section className="section pilot" id="pilot">
      <div className="container pilot-inner">
        <div>
          <div className="eyebrow on-dark"><span className="dot" />What comes next</div>
          <h2 className="h2" style={{ color: 'white' }}>From audit to live calls in days.</h2>
          <div style={{ height: 18 }} />
          <p className="pilot-lede">
            The audit maps where your leads are leaking. The pilot fixes it — one location,
            in your actual environment.
          </p>
          <div style={{ height: 28 }} />
          <a href="#audit" className="btn btn-accent">Request the audit <IconArrow size={16} /></a>
        </div>
        <div className="pilot-checks">
          {checks.map((c, i) => (
            <div className="pilot-check" key={i}>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <span className="t">{c}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   30-SECOND CHALLENGE — Embedded GHL form
========================================================= */
function Challenge() {
  // Load GHL's auto-resize script once
  useEffect(() => {
    if (document.querySelector('script[src*="form_embed.js"]')) return;
    const s = document.createElement('script');
    s.src = 'https://link.msgsndr.com/js/form_embed.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return (
    <section className="section challenge" id="challenge">
      <div className="container">
        <div className="challenge-card">
          <div className="challenge-head">
            <div className="eyebrow" style={{ justifyContent: 'center', display: 'inline-flex' }}>
              <span className="dot" />30‑second challenge
            </div>
            <h2 className="h2">Want to see how fast your leads could be called?</h2>
            <p className="lede" style={{ margin: '12px auto 0' }}>
              Submit a test request and experience the response flow for yourself.
            </p>
          </div>

          <div className="ghl-form-wrap">
            <iframe
              src="https://api.leadconnectorhq.com/widget/form/GSuMKD7GFMhd0SUdlyAC"
              style={{ width: '100%', height: '560px', border: 'none', borderRadius: 10, display: 'block' }}
              id="inline-GSuMKD7GFMhd0SUdlyAC"
              data-layout='{"id":"INLINE"}'
              data-trigger-type="alwaysShow"
              data-trigger-value=""
              data-activation-type="alwaysActivated"
              data-activation-value=""
              data-deactivation-type="neverDeactivate"
              data-deactivation-value=""
              data-form-name="RunWise 30-Second Challenge"
              data-height="560"
              data-layout-iframe-id="inline-GSuMKD7GFMhd0SUdlyAC"
              data-form-id="GSuMKD7GFMhd0SUdlyAC"
              title="RunWise 30-Second Challenge"
            />
          </div>

          <div className="challenge-foot">
            <IconShield size={14} />
            <span>We'll call the number you provide. RunWise only uses it to demo the response flow.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   FAQ
========================================================= */
const faqs = [
  { q: 'Does RunWise replace my dispatcher?',
    a: 'No. It supports the team by handling fast lead response and routing the right calls to humans. Your dispatcher focuses on booked work and exceptions; RunWise handles the noisy top of the funnel.' },
  { q: 'Can it book appointments?',
    a: 'Yes, when calendar or booking access is available. RunWise offers arrival windows you actually control — not vague promises.' },
  { q: 'What happens with urgent or safety‑related calls?',
    a: 'They are flagged and escalated based on the client\u2019s rules. Gas smells, electrical concerns, no‑heat in extreme weather, anything you tell us to treat as urgent — routed to a human immediately.' },
  { q: 'What if we use ServiceTitan or Housecall Pro?',
    a: 'RunWise can often support these workflows through approved APIs, Zapier, Make, calendar syncs, or booking links, depending on the access available in your account. We scope this during the pilot — no universal promise.' },
  { q: 'What lead sources can it handle?',
    a: 'GHL forms, website forms, email lead notifications, and other structured lead sources. If a lead has a phone number and arrives in a known format, RunWise can act on it.' },
  { q: 'Where does call data live?',
    a: 'In your RunWise/GHL workspace — outcome, transcript, recording, and notes for every call. Booked appointments are pushed to your FSM (ServiceTitan, Housecall Pro, etc.) where API, Zapier, Make, calendar, or booking‑link access is available.' },
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section faq" id="faq">
      <div className="container faq-grid">
        <div>
          <div className="eyebrow"><span className="dot" />FAQ</div>
          <h2 className="h2">Straight answers.</h2>
          <div style={{ height: 14 }} />
          <p className="lede">
            The questions we get from owners and dispatch managers, answered without spin.
          </p>
        </div>
        <div className="faq-list">
          {faqs.map((f, i) => (
            <div className={`faq-item ${open === i ? 'open' : ''}`} key={i}>
              <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{f.q}</span>
                <span className="chev"><IconPlus size={12} /></span>
              </button>
              <div className="faq-a">
                <div className="faq-a-inner">{f.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   AUDIT CTA — Primary conversion section
========================================================= */
const spendOptions = [
  { value: '',        label: 'Select range…' },
  { value: '<1k',     label: 'Less than $1,000/mo' },
  { value: '1k-3k',   label: '$1,000–$3,000/mo' },
  { value: '3k-5k',   label: '$3,000–$5,000/mo' },
  { value: '5k-10k',  label: '$5,000–$10,000/mo' },
  { value: '10k+',    label: '$10,000+/mo' },
];
const timeOptions = [
  { value: '',          label: 'Select a time…' },
  { value: 'morning',   label: 'Morning (8am–12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm–4pm)' },
  { value: 'evening',   label: 'Evening (4pm–7pm)' },
  { value: 'flexible',  label: 'Flexible' },
];
const sourceOptions = [
  'Google Search / PPC', 'Google LSA', 'Facebook / Instagram',
  'Angi / HomeAdvisor', 'Website forms', 'Other',
];

function AuditCta() {
  const blank = { name:'', company:'', website:'', phone:'', email:'', spend:'', sources:[], time:'' };
  const [form, setForm] = useState(blank);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: false }));
  };
  const toggleSource = src => setForm(f => ({
    ...f,
    sources: f.sources.includes(src) ? f.sources.filter(s => s !== src) : [...f.sources, src],
  }));

  const handleSubmit = evt => {
    evt.preventDefault();
    const errs = {};
    if (!form.name.trim())    errs.name    = true;
    if (!form.company.trim()) errs.company = true;
    if (!form.website.trim()) errs.website = true;
    if (!form.phone.trim())   errs.phone   = true;
    if (!form.email.trim() || !form.email.includes('@')) errs.email = true;
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    fetch('https://services.leadconnectorhq.com/hooks/a7pBMlE3ysjoLUmsz9Qz/webhook-trigger/5cc16877-638c-4281-9279-e589783e236d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).finally(() => { setSubmitted(true); setSubmitting(false); });
  };

  if (submitted) {
    return (
      <section className="audit-cta" id="audit">
        <div className="container audit-submitted">
          <div className="eyebrow on-dark" style={{ justifyContent:'center', display:'inline-flex' }}>
            <span className="dot" />Audit requested
          </div>
          <h2 className="h2" style={{ color:'white', margin:'16px 0 14px' }}>You're on the list.</h2>
          <p style={{ color:'var(--slate-300)', fontSize:17, maxWidth:'46ch', margin:'0 auto' }}>
            We'll be in touch within one business day to schedule your 5–7 minute intake call.
            No system access needed before then.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="audit-cta" id="audit">
      <div className="container">
        <div className="audit-head">
          <div className="eyebrow on-dark" style={{ justifyContent:'center', display:'inline-flex' }}>
            <span className="dot" />48-Hour Paid Lead Leak Audit
          </div>
          <h2 className="h2 audit-headline">
            Are Your Paid HVAC Leads Turning Into Booked Jobs Fast Enough?
          </h2>
          <p className="audit-sub">
            You're already paying for the leads. We show you where slow response, missed calls,
            after-hours gaps, or weak follow-up may be costing you booked jobs.
          </p>
          <p className="audit-qualify">
            Best fit for HVAC contractors spending $5K+/month on Google, LSA, Facebook, Angi,
            or other paid lead sources.
          </p>
        </div>

        <div className="audit-body">
          <form className="audit-form" onSubmit={handleSubmit} noValidate>
            <p className="audit-credibility">
              No system access required. No ad account access required. We start with a short intake
              call and one controlled test — with your permission.
            </p>
            <div className="audit-form-grid">
              <div className={`afield ${errors.name ? 'err' : ''}`}>
                <label>Name *</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className={`afield ${errors.company ? 'err' : ''}`}>
                <label>Company *</label>
                <input type="text" value={form.company} onChange={e => set('company', e.target.value)} placeholder="Pioneer Heating & Air" />
              </div>
              <div className={`afield ${errors.website ? 'err' : ''}`}>
                <label>Website *</label>
                <input type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://" />
              </div>
              <div className={`afield ${errors.phone ? 'err' : ''}`}>
                <label>Phone *</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
              </div>
              <div className={`afield full ${errors.email ? 'err' : ''}`}>
                <label>Email *</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@pioneerair.com" />
              </div>
              <div className="afield">
                <label>Monthly paid lead spend</label>
                <select value={form.spend} onChange={e => set('spend', e.target.value)}>
                  {spendOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="afield">
                <label>Best time to talk</label>
                <select value={form.time} onChange={e => set('time', e.target.value)}>
                  {timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="afield full">
                <label>Main lead sources</label>
                <div className="source-checks">
                  {sourceOptions.map(src => (
                    <label key={src} className="check-label">
                      <input type="checkbox" checked={form.sources.includes(src)} onChange={() => toggleSource(src)} />
                      <span>{src}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="audit-submit-row">
              <button type="submit" className="btn btn-gold" disabled={submitting}>
                {submitting ? 'Sending…' : <>Request My 48-Hour Audit <IconArrow size={16} /></>}
              </button>
              <p className="audit-foot-note">
                No system access required. No ad account access required. We begin with a 5–7 minute
                intake call and one controlled test, with your permission.
              </p>
            </div>
          </form>

          <div className="audit-what-next">
            <p className="awn-title">What happens next</p>
            {[
              { n:'01', t:'Intake call',         d:'5–7 minutes. We map your lead flow before recommending anything.' },
              { n:'02', t:'Controlled test',      d:'One controlled test using agreed-upon test contact info, with your permission.' },
              { n:'03', t:'48-hour findings',     d:'We show where response delays or visibility gaps may be leaking booked jobs.' },
              { n:'04', t:'Clear recommendation', d:'A clear fix plan, not a vague AI pitch.' },
            ].map(s => (
              <div className="awn-step" key={s.n}>
                <span className="awn-num">{s.n}</span>
                <div>
                  <div className="awn-t">{s.t}</div>
                  <div className="awn-d">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-logo">
          <img src="assets/logo-footer.png" alt="RunWise Systems" />
          <span style={{ color: 'var(--slate-400)', marginLeft: 4 }}>© 2026</span>
        </div>
        <div className="footer-links">
          <a href="#what">Product</a>
          <a href="#pilot">Pilot</a>
          <a href="#faq">FAQ</a>
          <a href="#audit">Contact</a>
        </div>
      </div>
    </footer>
  );
}

/* =========================================================
   APP
========================================================= */
function App() {
  return (
    <>
      <Nav />
      <Hero />
      <TrustStrip />
      <Problem />
      <Features />
      <HowItWorks />
      <BuiltForHVAC />
      <Roi />
      <Pilot />
      <Challenge />
      <Faq />
      <AuditCta />
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
