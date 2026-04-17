import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { applicationApi, Application } from '../api/client'
import StatusBadge from './StatusBadge'

function ApplicationCard({ app, onDone }: { app: Application; onDone: () => void }) {
  const [showDiff, setShowDiff] = useState(false)
  const [notes, setNotes] = useState('')
  const qc = useQueryClient()

  const approve = useMutation({
    mutationFn: () => applicationApi.approve(app.id, notes || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applications'] }); onDone() },
  })
  const reject = useMutation({
    mutationFn: () => applicationApi.reject(app.id, notes || undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applications'] }); onDone() },
  })

  const originalText = (() => {
    try { return JSON.stringify(JSON.parse(app.job.description_raw ?? '{}'), null, 2) } catch { return app.job.description_raw ?? '' }
  })()
  const tailoredText = (() => {
    try { return JSON.stringify(JSON.parse(app.tailored_resume_text ?? '{}'), null, 2) } catch { return app.tailored_resume_text ?? '' }
  })()

  const score = app.job.match_score
  const scoreColor = score !== null && score >= 0.8 ? 'text-green-600' : score !== null && score >= 0.6 ? 'text-yellow-600' : 'text-red-500'

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900">{app.job.title}</h3>
          <p className="text-sm text-gray-500">{app.job.company} · {app.job.location ?? 'Remote'} · <span className="capitalize">{app.job.board_source}</span></p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={app.status} />
          {score !== null && (
            <span className={`text-sm font-bold ${scoreColor}`}>{Math.round(score * 100)}% match</span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <a href={app.job.url} target="_blank" rel="noopener noreferrer"
           className="text-xs text-indigo-600 hover:underline">View job ↗</a>
        <button onClick={() => setShowDiff(d => !d)}
                className="text-xs text-gray-500 hover:text-gray-800 underline">
          {showDiff ? 'Hide' : 'Show'} resume diff
        </button>
      </div>

      {showDiff && (
        <div className="rounded-md overflow-hidden border border-gray-200 text-xs">
          <ReactDiffViewer
            oldValue={originalText}
            newValue={tailoredText}
            splitView={true}
            leftTitle="Original resume"
            rightTitle="Tailored resume"
            useDarkTheme={false}
          />
        </div>
      )}

      <div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes…"
          rows={2}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => approve.mutate()}
          disabled={approve.isPending}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-md transition"
        >
          {approve.isPending ? 'Approving…' : 'Approve & Submit'}
        </button>
        <button
          onClick={() => reject.mutate()}
          disabled={reject.isPending}
          className="flex-1 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-md transition"
        >
          {reject.isPending ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  )
}

export default function ReviewQueue() {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['applications', 'pending_review'],
    queryFn: () => applicationApi.list('pending_review').then(r => r.data),
    refetchInterval: 15000,
  })

  const visible = apps.filter((a: Application) => !dismissed.has(a.id))

  if (isLoading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (!visible.length) return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-4xl mb-3">✓</p>
      <p className="text-sm">No applications pending review.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {visible.map((app: Application) => (
        <ApplicationCard key={app.id} app={app} onDone={() => setDismissed(d => new Set([...d, app.id]))} />
      ))}
    </div>
  )
}
