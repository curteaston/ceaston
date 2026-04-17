import { useQuery } from '@tanstack/react-query'
import { jobApi, applicationApi } from '../api/client'
import JobTable from '../components/JobTable'
import { Link } from 'react-router-dom'

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-5 flex flex-col gap-1`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

export default function Dashboard() {
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: () => jobApi.list().then(r => r.data), refetchInterval: 30000 })
  const { data: apps = [] } = useQuery({ queryKey: ['applications'], queryFn: () => applicationApi.list().then(r => r.data), refetchInterval: 30000 })

  const pending = apps.filter((a: { status: string }) => a.status === 'pending_review').length
  const submitted = apps.filter((a: { status: string }) => a.status === 'submitted').length

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Jobs Found" value={jobs.length} color="text-indigo-600" />
        <StatCard label="Pending Review" value={pending} color="text-yellow-600" />
        <StatCard label="Submitted" value={submitted} color="text-green-600" />
      </div>

      {pending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-yellow-800 font-medium">
            {pending} application{pending > 1 ? 's' : ''} waiting for your review
          </p>
          <Link to="/applications" className="text-sm text-yellow-900 font-semibold underline">Review now →</Link>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Recent Jobs</h2>
        <JobTable />
      </div>
    </div>
  )
}
