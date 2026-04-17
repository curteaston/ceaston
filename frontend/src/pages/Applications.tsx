import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { applicationApi, Application } from '../api/client'
import ReviewQueue from '../components/ReviewQueue'
import StatusBadge from '../components/StatusBadge'

function HistoryTable() {
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['applications', 'history'],
    queryFn: () => applicationApi.list().then(r => r.data.filter((a: Application) => a.status !== 'pending_review')),
    refetchInterval: 30000,
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (!apps.length) return <p className="text-gray-500 text-sm">No application history yet.</p>

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
          <tr>
            {['Job', 'Company', 'Board', 'Status', 'Submitted', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {apps.map((app: Application) => (
            <tr key={app.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{app.job.title}</td>
              <td className="px-4 py-3 text-gray-600">{app.job.company}</td>
              <td className="px-4 py-3 text-gray-500 capitalize">{app.job.board_source}</td>
              <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3">
                <a href={app.job.url} target="_blank" rel="noopener noreferrer"
                   className="text-indigo-600 hover:underline text-xs">View ↗</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Applications() {
  const [tab, setTab] = useState<'review' | 'history'>('review')
  const tabClass = (t: typeof tab) =>
    `px-4 py-2 text-sm font-medium rounded-t-md border-b-2 ${tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
      <div className="flex gap-2 border-b border-gray-200">
        <button className={tabClass('review')} onClick={() => setTab('review')}>Review Queue</button>
        <button className={tabClass('history')} onClick={() => setTab('history')}>History</button>
      </div>
      {tab === 'review' ? <ReviewQueue /> : <HistoryTable />}
    </div>
  )
}
