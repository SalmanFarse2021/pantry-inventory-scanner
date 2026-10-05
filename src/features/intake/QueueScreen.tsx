import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { StatusDot, statusLabel } from './StatusDot'
import { useCaptureQueue } from './useCaptureQueue'
import { useIntakeJobs, type IntakeJob } from './useIntakeJobs'
import { requestIdentify } from './uploader'

const thumbUrl = (jobId: string) => supabase.storage.from('thumbnails').getPublicUrl(`${jobId}.jpg`).data.publicUrl

export function QueueScreen() {
  const { batchId, pending, newBatch } = useCaptureQueue()
  const { data: jobs = [], isLoading, error } = useIntakeJobs(batchId)
  const queryClient = useQueryClient()

  // Local photos that have not reached the server yet are shown first.
  const pendingUrls = usePendingUrls(pending)

  async function retry(job: IntakeJob) {
    await requestIdentify(job.id).catch(() => {})
    void queryClient.invalidateQueries({ queryKey: ['intake-jobs', batchId] })
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Queue</h1>
        <div className="flex gap-2">
          <Link to="/staff/capture" className="btn btn-sm btn-primary">Add items</Link>
          <button className="btn btn-sm btn-ghost" onClick={newBatch}>New batch</button>
        </div>
      </header>

      {error && <div role="alert" className="alert alert-error alert-soft">{error.message}</div>}
      {isLoading && <span className="loading loading-spinner mx-auto" />}
      {!isLoading && !jobs.length && !pending.length && <p className="opacity-70">Nothing in this batch yet.</p>}

      <ul className="flex flex-col gap-2">
        {pending.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-box bg-base-200 p-2">
            <img src={pendingUrls[c.id]} alt="" className="size-14 rounded-field object-cover" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Uploading…</div>
              <div className="text-sm opacity-70">Qty {c.quantity}. Saved on this phone until it uploads.</div>
            </div>
            <span className="loading loading-spinner loading-sm" />
          </li>
        ))}
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center gap-3 rounded-box bg-base-200 p-2">
            <img src={thumbUrl(job.id)} alt="" className="size-14 rounded-field bg-base-300 object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{job.items?.name ?? job.identified?.name ?? statusLabel(job.status)}</div>
              <div className="truncate text-sm opacity-70">
                Qty {job.quantity}
                {job.items && ` · ${job.items.categories.join(', ').replaceAll('_', ' ')}`}
                {job.status === 'red' && job.error && ` · ${job.error}`}
              </div>
            </div>
            {(job.status === 'queued' || job.status === 'red' || job.status === 'waiting_quota') && (
              <button className="btn btn-xs" onClick={() => retry(job)}>Retry</button>
            )}
            {job.status !== 'processing' && (
              <Link to="/staff/review/$jobId" params={{ jobId: job.id }} className="btn btn-xs btn-outline">
                {job.status === 'yellow' ? 'Review' : job.status === 'green' ? 'Edit' : 'Enter'}
              </Link>
            )}
            <StatusDot status={job.status} />
          </li>
        ))}
      </ul>
    </main>
  )
}

function usePendingUrls(pending: { id: string; thumb: Blob }[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const next = Object.fromEntries(pending.map((c) => [c.id, URL.createObjectURL(c.thumb)]))
    setUrls(next)
    return () => Object.values(next).forEach(URL.revokeObjectURL)
  }, [pending])
  return urls
}
