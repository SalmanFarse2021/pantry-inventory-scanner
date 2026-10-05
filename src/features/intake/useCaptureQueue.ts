import { create } from 'zustand'
import { loadPending, removePending, savePending, type PendingCapture } from './queueDb'
import { requestIdentify, uploadCapture } from './uploader'

const BATCH_KEY = 'pantry-batch-id'
const readBatchId = () => {
  try {
    return localStorage.getItem(BATCH_KEY) ?? newBatchId()
  } catch {
    return crypto.randomUUID()
  }
}
function newBatchId() {
  const id = crypto.randomUUID()
  try {
    localStorage.setItem(BATCH_KEY, id)
  } catch {
    // private mode: batch just lasts for this page load
  }
  return id
}

type State = {
  batchId: string
  pending: PendingCapture[]
  last: PendingCapture | null // for the "same as last" shortcut
  enqueue: (photo: Blob, thumb: Blob, quantity: number) => Promise<void>
  newBatch: () => void
  flush: () => Promise<void>
}

let flushing = false

export const useCaptureQueue = create<State>((set, get) => ({
  batchId: readBatchId(),
  pending: [],
  last: null,

  async enqueue(photo, thumb, quantity) {
    const capture: PendingCapture = {
      id: crypto.randomUUID(),
      batchId: get().batchId,
      photo,
      thumb,
      quantity,
      createdAt: Date.now(),
    }
    await savePending(capture)
    set((s) => ({ pending: [...s.pending, capture], last: capture }))
    void get().flush()
  },

  newBatch() {
    set({ batchId: newBatchId() })
  },

  async flush() {
    if (flushing) return
    flushing = true
    try {
      for (const capture of [...get().pending]) {
        try {
          await uploadCapture(capture)
        } catch {
          break // offline or signed out; the timer / online event retries
        }
        await removePending(capture.id)
        set((s) => ({ pending: s.pending.filter((p) => p.id !== capture.id) }))
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
