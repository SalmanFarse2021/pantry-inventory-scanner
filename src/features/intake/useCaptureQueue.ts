import { uuid } from '../../lib/uuid'
import { create } from 'zustand'
import type { PublicAvailability } from '../../../shared/catalogView'
import { loadPending, removePending, savePending, type PendingCapture } from './queueDb'
import { requestIdentify, uploadCapture } from './uploader'

const BATCH_KEY = 'pantry-batch-id'
const readBatchId = () => {
  try {
    return localStorage.getItem(BATCH_KEY) ?? newBatchId()
  } catch {
    return uuid()
  }
}
function newBatchId() {
  const id = uuid()
  try {
    localStorage.setItem(BATCH_KEY, id)
  } catch {
    // private mode: batch just lasts for this page load
  }
  return id
}

const DISMISSED_KEY = 'pantry-dismissed-jobs'
const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
  } catch {
    return []
  }
}

type State = {
  batchId: string
  dismissed: string[] // finished jobs the user cleared from the queue view
  pending: PendingCapture[]
  last: PendingCapture | null // for the "same as last" shortcut
  errors: Record<string, string> // why a capture is still waiting, by capture id
  enqueue: (photo: Blob, thumb: Blob, availability: PublicAvailability) => Promise<void>
  newBatch: () => void
  dismiss: (ids: string[]) => void
  discard: (id: string) => Promise<void>
  flush: () => Promise<void>
}

let flushing = false

export const useCaptureQueue = create<State>((set, get) => ({
  batchId: readBatchId(),
  pending: [],
  last: null,
  errors: {},
  dismissed: readDismissed(),

  async enqueue(photo, thumb, availability) {
    const capture: PendingCapture = {
      id: uuid(),
      batchId: get().batchId,
      photo,
      thumb,
      availability,
      createdAt: Date.now(),
    }
    await savePending(capture)
    set((s) => ({ pending: [...s.pending, capture], last: capture }))
    void get().flush()
  },

  newBatch() {
    set({ batchId: newBatchId() })
  },

  // Hide finished jobs from the queue view only; the server records are untouched.
  dismiss(ids) {
    const dismissed = [...new Set([...get().dismissed, ...ids])]
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed))
    } catch {
      // private mode: they come back on reload
    }
    set({ dismissed })
  },

  // Drop a capture that cannot upload. It is removed from the phone, so this cannot be undone.
  async discard(id) {
    await removePending(id)
    set((s) => {
      const { [id]: _gone, ...errors } = s.errors
      return { pending: s.pending.filter((p) => p.id !== id), errors }
    })
  },

  async flush() {
    if (flushing) return
    flushing = true
    try {
      for (const capture of [...get().pending]) {
        try {
          await uploadCapture(capture)
        } catch (err) {
          // Keep the reason so the queue can show it; the timer / online event retries.
          const message = err instanceof Error ? err.message : String(err)
          set((s) => ({ errors: { ...s.errors, [capture.id]: message } }))
          continue // one stuck photo must not block the ones behind it
        }
        await removePending(capture.id)
        set((s) => {
          const { [capture.id]: _done, ...errors } = s.errors
          return { pending: s.pending.filter((p) => p.id !== capture.id), errors }
        })
        void requestIdentify(capture.id).catch(() => {})
      }
    } finally {
      flushing = false
    }
  },
}))

// Restore anything left over from a previous session and keep retrying in the background.
export async function startQueueSync() {
  const left = await loadPending()
  useCaptureQueue.setState((s) => ({
    pending: [...left.filter((c) => !s.pending.some((p) => p.id === c.id)), ...s.pending],
  }))
  const flush = () => void useCaptureQueue.getState().flush()
  window.addEventListener('online', flush)
  const timer = setInterval(flush, 15_000)
  flush()
  return () => {
    window.removeEventListener('online', flush)
    clearInterval(timer)
  }
}
