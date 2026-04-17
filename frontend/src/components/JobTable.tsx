import { useQuery } from '@tanstack/react-query'
import { jobApi, Job } from '../api/client'
import StatusBadge from './StatusBadge'

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600">{pct}%</span>
    </div>
  )
}

export default function JobTable({ status }: { status?: string }) {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', status],
    queryFn: () => jobApi.list(status).then(r => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Loading jobs…</p>
  if (!jobs.length) return <p className="text-gray-500 text-sm">No jobs found.</p>

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
          <tr>
            {['Title', 'Company', 'Location', 'Source', 'Match', 'Status', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {jobs.map((job: Job) => (
            <tr key={job.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{job.title}</td>
              <td className="px-4 py-3 text-gray-600">{job.company}</td>
              <td className="px-4 py-3 text-gray-500">{job.location ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500 capitalize">{job.board_source}</td>
              <td className="px-4 py-3"><ScoreBar score={job.match_score} /></td>
              <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
              <td className="px-4 py-3">
                <a href={job.url} target="_blank" rel="noopener noreferrer"
                   className="text-indigo-600 hover:underline text-xs">View ↗</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
