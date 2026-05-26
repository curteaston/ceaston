/* eslint-disable */
// Icons — minimal stroked SVG. All 1.6 stroke, 24x24 viewBox.
const Icon = ({ children, size = 18, stroke = 1.6, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);

const IconPhone = (p) => <Icon {...p}>
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/>
</Icon>;

const IconBolt = (p) => <Icon {...p}>
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
</Icon>;

const IconCheckCircle = (p) => <Icon {...p} stroke={1.8}>
  <circle cx="12" cy="12" r="10"/>
  <polyline points="9 12 11 14 15 10"/>
</Icon>;

const IconCheck = (p) => <Icon {...p} stroke={2}>
  <polyline points="20 6 9 17 4 12"/>
</Icon>;

const IconCalendar = (p) => <Icon {...p}>
  <rect x="3" y="4" width="18" height="18" rx="2"/>
  <line x1="3" y1="10" x2="21" y2="10"/>
  <line x1="8" y1="2" x2="8" y2="6"/>
  <line x1="16" y1="2" x2="16" y2="6"/>
</Icon>;

const IconAlert = (p) => <Icon {...p}>
  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
  <line x1="12" y1="9" x2="12" y2="13"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</Icon>;

const IconShield = (p) => <Icon {...p}>
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
</Icon>;

const IconClipboard = (p) => <Icon {...p}>
  <path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/>
  <rect x="9" y="3" width="6" height="4" rx="1"/>
  <line x1="9" y1="12" x2="15" y2="12"/>
  <line x1="9" y1="16" x2="13" y2="16"/>
</Icon>;

const IconChart = (p) => <Icon {...p}>
  <line x1="3" y1="20" x2="21" y2="20"/>
  <rect x="6" y="11" width="3" height="9"/>
  <rect x="11" y="6" width="3" height="14"/>
  <rect x="16" y="14" width="3" height="6"/>
</Icon>;

const IconRoute = (p) => <Icon {...p}>
  <circle cx="6" cy="19" r="3"/>
  <circle cx="18" cy="5" r="3"/>
  <path d="M6.7 17.3a4 4 0 0 1-1.7-3.3v-2a4 4 0 0 1 4-4h6a4 4 0 0 0 4-4"/>
</Icon>;

const IconHvac = (p) => <Icon {...p}>
  <rect x="3" y="4" width="18" height="12" rx="2"/>
  <line x1="3" y1="9" x2="21" y2="9"/>
  <line x1="3" y1="13" x2="21" y2="13"/>
  <line x1="8" y1="20" x2="8" y2="16"/>
  <line x1="16" y1="20" x2="16" y2="16"/>
</Icon>;

const IconSnow = (p) => <Icon {...p}>
  <line x1="12" y1="2" x2="12" y2="22"/>
  <line x1="2" y1="12" x2="22" y2="12"/>
  <line x1="5" y1="5" x2="19" y2="19"/>
  <line x1="19" y1="5" x2="5" y2="19"/>
</Icon>;

const IconFlame = (p) => <Icon {...p}>
  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c0-1.66 1-2 1.5-3 1-2-1-4-2-5-1.5 1.5-3 3-3 5.5z"/>
  <path d="M16 11c-.7-1.7-2-3-2-3s-1 1-1 2c-1-1-2-2-2-2-2 1.5-4 4-4 7a6 6 0 0 0 12 0c0-1.5-1-3-3-4z"/>
</Icon>;

const IconWrench = (p) => <Icon {...p}>
  <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a1.4 1.4 0 1 0 2 2l6-6a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.1-2.1z"/>
</Icon>;

const IconTruck = (p) => <Icon {...p}>
  <path d="M1 6h13v11H1z"/>
  <path d="M14 9h4l3 4v4h-7z"/>
  <circle cx="5.5" cy="18.5" r="2"/>
  <circle cx="17.5" cy="18.5" r="2"/>
</Icon>;

const IconTool = (p) => <Icon {...p}>
  <path d="M14.7 6.3a4 4 0 1 0 5.7 5.7l-2.7-2.7L20 7l-3-3-2.3 2.3z"/>
  <path d="M14 12 4 22"/>
</Icon>;

const IconUser = (p) => <Icon {...p}>
  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
  <circle cx="12" cy="7" r="4"/>
</Icon>;

const IconArrow = (p) => <Icon {...p}>
  <line x1="5" y1="12" x2="19" y2="12"/>
  <polyline points="13 6 19 12 13 18"/>
</Icon>;

const IconPlus = (p) => <Icon {...p}>
  <line x1="12" y1="5" x2="12" y2="19"/>
  <line x1="5" y1="12" x2="19" y2="12"/>
</Icon>;

const IconClock = (p) => <Icon {...p}>
  <circle cx="12" cy="12" r="10"/>
  <polyline points="12 6 12 12 16 14"/>
</Icon>;

const IconMic = (p) => <Icon {...p}>
  <rect x="9" y="2" width="6" height="12" rx="3"/>
  <path d="M5 10a7 7 0 0 0 14 0"/>
  <line x1="12" y1="17" x2="12" y2="22"/>
</Icon>;

window.Icons = {
  IconPhone, IconBolt, IconCheckCircle, IconCheck, IconCalendar, IconAlert,
  IconShield, IconClipboard, IconChart, IconRoute, IconHvac, IconSnow,
  IconFlame, IconWrench, IconTruck, IconTool, IconUser, IconArrow, IconPlus,
  IconClock, IconMic
};
