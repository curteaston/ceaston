import { create } from 'zustand';
import { api, qs } from './api.js';

const DEFAULT_META = {
  stages: ['lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
  ad_spend_ranges: ['unknown', '$0', '<$1k', '$1k-$5k', '$5k-$10k', '$10k-$25k', '$25k+'],
  priorities: ['low', 'medium', 'high'],
  lead_statuses: ['new', 'attempted', 'connected', 'qualified', 'unqualified', 'customer'],
  lifecycle_stages: ['subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist'],
};

export const LIFECYCLE_LABELS = {
  subscriber: 'Subscriber',
  lead: 'Lead',
  mql: 'Marketing Qualified Lead',
  sql: 'Sales Qualified Lead',
  opportunity: 'Opportunity',
  customer: 'Customer',
  evangelist: 'Evangelist',
};

export const useStore = create((set, get) => ({
  meta: DEFAULT_META,
  toast: null,

  notify(message, isError = false) {
    set({ toast: { message, isError, id: Date.now() } });
    setTimeout(() => {
      if (get().toast?.message === message) set({ toast: null });
    }, 3500);
  },

  async run(fn, successMsg) {
    try {
      const result = await fn();
      if (successMsg) get().notify(successMsg);
      return result;
    } catch (err) {
      get().notify(err.message, true);
      throw err;
    }
  },

  async fetchMeta() {
    try {
      set({ meta: await api.get('/meta') });
    } catch { /* defaults already set */ }
  },

  // ---- Companies list ----
  filters: { sort: 'last_activity_at', order: 'desc' },
  companies: [],
  total: 0,
  loadingCompanies: false,

  setFilters(patch) {
    const filters = { ...get().filters, ...patch, offset: 0 };
    set({ filters });
    get().fetchCompanies();
  },

  clearFilters() {
    set({ filters: { sort: 'last_activity_at', order: 'desc' } });
    get().fetchCompanies();
  },

  async fetchCompanies(more = false) {
    const { filters, companies } = get();
    const offset = more ? companies.length : 0;
    set({ loadingCompanies: true });
    try {
      const data = await api.get(`/companies${qs({ ...filters, limit: 100, offset })}`);
      set({
        companies: more ? [...companies, ...data.companies] : data.companies,
        total: data.total,
        loadingCompanies: false,
      });
    } catch (err) {
      set({ loadingCompanies: false });
      get().notify(err.message, true);
    }
  },

  // ---- Company detail (full payload: contacts + deals + tasks + timeline) ----
  company: null,
  loadingCompany: false,

  async fetchCompany(id) {
    set({ loadingCompany: true });
    try {
      set({ company: await api.get(`/companies/${id}/full`), loadingCompany: false });
    } catch (err) {
      set({ loadingCompany: false, company: null });
      get().notify(err.message, true);
    }
  },

  // Re-pull the open company after any mutation so contacts/timeline/deals stay in sync.
  async refreshCompany() {
    const id = get().company?.id;
    if (id) set({ company: await api.get(`/companies/${id}/full`) });
  },

  mutateCompany(fn, successMsg) {
    return get().run(async () => {
      const result = await fn();
      await get().refreshCompany();
      return result;
    }, successMsg);
  },

  // ---- Tasks page ----
  tasks: [],
  async fetchTasks(filters = {}) {
    try {
      set({ tasks: await api.get(`/tasks${qs(filters)}`) });
    } catch (err) {
      get().notify(err.message, true);
    }
  },

  async toggleTask(task) {
    // Optimistic flip in both the tasks page list and the open company payload.
    const apply = (t) => (t.id === task.id ? { ...t, completed: !task.completed } : t);
    set((s) => ({
      tasks: s.tasks.map(apply),
      company: s.company ? { ...s.company, tasks: s.company.tasks.map(apply) } : null,
    }));
    try {
      await api.patch(`/tasks/${task.id}`, { completed: !task.completed });
    } catch (err) {
      set((s) => ({
        tasks: s.tasks.map(apply),
        company: s.company ? { ...s.company, tasks: s.company.tasks.map(apply) } : null,
      }));
      get().notify(err.message, true);
    }
  },

  // ---- Dashboard ----
  dashboard: null,
  async fetchDashboard() {
    try {
      set({ dashboard: await api.get('/dashboard') });
    } catch (err) {
      get().notify(err.message, true);
    }
  },
}));
