const COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  queued: 'bg-blue-100 text-blue-700',
  applied: 'bg-green-100 text-green-700',
  skipped: 'bg-gray-100 text-gray-400',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  submitted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-800',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
