import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export interface Profile {
  id: number
  full_name: string
  email: string
  phone: string | null
  linkedin_url: string | null
  location: string | null
  resume_file_path: string | null
}

export interface Job {
  id: number
  board_source: string
  title: string
  company: string
  location: string | null
  url: string
  match_score: number | null
  status: string
  posted_at: string | null
  scraped_at: string
  description_raw?: string | null
}

export interface Application {
  id: number
  job_id: number
  profile_id: number
  status: string
  tailored_resume_text: string | null
  tailored_resume_pdf_path: string | null
  review_notes: string | null
  error_message: string | null
  submitted_at: string | null
  created_at: string
  job: Job
}

export const profileApi = {
  create: (data: Omit<Profile, 'id' | 'resume_file_path'>) => api.post<Profile>('/profile', data),
  get: (id: number) => api.get<Profile>(`/profile/${id}`),
  uploadResume: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Profile>(`/profile/${id}/resume`, form)
  },
  setCriteria: (id: number, data: object) => api.post(`/profile/${id}/criteria`, data),
}

export const jobApi = {
  list: (status?: string) => api.get<Job[]>('/jobs', { params: { status, limit: 100 } }),
  triggerScan: (profileId: number) => api.post(`/jobs/scan?profile_id=${profileId}`),
}

export const applicationApi = {
  list: (status?: string) => api.get<Application[]>('/applications', { params: { status, limit: 100 } }),
  approve: (id: number, notes?: string) => api.post<Application>(`/applications/${id}/approve`, { notes }),
  reject: (id: number, notes?: string) => api.post<Application>(`/applications/${id}/reject`, { notes }),
}
