import { supabase } from '../../lib/supabase'
import type { PendingCapture } from './queueDb'

// Upload one capture and create its job. Safe to repeat: storage uses upsert and a duplicate
// job id counts as already done, so a retry after a dropped connection never double-counts.
export async function uploadCapture(c: PendingCapture): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) throw new Error('signed out')

  const photoPath = `${c.batchId}/${c.id}.jpg`
  const opts = { contentType: 'image/jpeg', upsert: true }
  const [photo, thumb] = await Promise.all([
    supabase.storage.from('intake-photos').upload(photoPath, c.photo, opts),
    supabase.storage.from('thumbnails').upload(`${c.id}.jpg`, c.thumb, opts),
  ])
  if (photo.error) throw photo.error
  if (thumb.error) throw thumb.error

  const { error } = await supabase.from('intake_jobs').insert({
    id: c.id,
    batch_id: c.batchId,
    photo_path: photoPath,
    quantity: c.quantity,
    created_by: session.user.id,
  })
  if (error && error.code !== '23505') throw error
}

// Ask the server to identify a job. The result arrives through Realtime, so failures here only
// mean the job stays "queued" until someone retries it from the queue screen.
export async function requestIdentify(jobId: string): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify({ jobId }),
  })
  if (!res.ok && res.status !== 409) throw new Error(`identify failed (${res.status})`)
}
