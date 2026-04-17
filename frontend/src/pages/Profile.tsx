import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { profileApi } from '../api/client'

export default function Profile() {
  const [profileId, setProfileId] = useState<number | null>(null)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', linkedin_url: '', location: '' })
  const [criteria, setCriteria] = useState({ keywords: '', location: '', remote_only: false, job_type: '', salary_min: '' })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')

  const createProfile = useMutation({
    mutationFn: () => profileApi.create({ ...form }),
    onSuccess: (r) => { setProfileId(r.data.id); setMessage('Profile saved!') },
    onError: () => setMessage('Failed to save profile.'),
  })

  const uploadResume = useMutation({
    mutationFn: () => profileApi.uploadResume(profileId!, resumeFile!),
    onSuccess: () => setMessage('Resume uploaded and parsed!'),
    onError: () => setMessage('Resume upload failed.'),
  })

  const saveCriteria = useMutation({
    mutationFn: () => profileApi.setCriteria(profileId!, {
      keywords: criteria.keywords.split(',').map(k => k.trim()).filter(Boolean),
      location: criteria.location || null,
      remote_only: criteria.remote_only,
      job_type: criteria.job_type || null,
      salary_min: criteria.salary_min ? parseInt(criteria.salary_min) : null,
      excluded_companies: [],
    }),
    onSuccess: () => setMessage('Search criteria saved!'),
    onError: () => setMessage('Failed to save criteria.'),
  })

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
             className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
    </div>
  )

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Profile Setup</h1>

      {message && <p className="text-sm text-indigo-700 bg-indigo-50 rounded-md px-4 py-2">{message}</p>}

      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Personal Info</h2>
        {field('Full Name', 'full_name')}
        {field('Email', 'email', 'email')}
        {field('Phone', 'phone', 'tel')}
        {field('LinkedIn URL', 'linkedin_url', 'url')}
        {field('Location', 'location')}
        <button onClick={() => createProfile.mutate()} disabled={createProfile.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md">
          {createProfile.isPending ? 'Saving…' : 'Save Profile'}
        </button>
      </section>

      {profileId && (
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Upload Resume (PDF)</h2>
          <input type="file" accept=".pdf" onChange={e => setResumeFile(e.target.files?.[0] ?? null)}
                 className="text-sm text-gray-600" />
          <button onClick={() => uploadResume.mutate()} disabled={!resumeFile || uploadResume.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md">
            {uploadResume.isPending ? 'Uploading…' : 'Upload & Parse'}
          </button>
        </section>
      )}

      {profileId && (
        <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Job Search Criteria</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (comma-separated)</label>
            <input type="text" placeholder="software engineer, python, react"
                   value={criteria.keywords} onChange={e => setCriteria(c => ({ ...c, keywords: e.target.value }))}
                   className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" placeholder="San Francisco, CA"
                   value={criteria.location} onChange={e => setCriteria(c => ({ ...c, location: e.target.value }))}
                   className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="remote" checked={criteria.remote_only}
                   onChange={e => setCriteria(c => ({ ...c, remote_only: e.target.checked }))} />
            <label htmlFor="remote" className="text-sm text-gray-700">Remote only</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Salary</label>
            <input type="number" placeholder="100000"
                   value={criteria.salary_min} onChange={e => setCriteria(c => ({ ...c, salary_min: e.target.value }))}
                   className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <button onClick={() => saveCriteria.mutate()} disabled={saveCriteria.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md">
            {saveCriteria.isPending ? 'Saving…' : 'Save Criteria'}
          </button>
        </section>
      )}
    </div>
  )
}
