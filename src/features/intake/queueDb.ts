import { createStore, del, entries, set } from 'idb-keyval'

// A photo waiting to be uploaded. Saved on the phone first so weak Wi-Fi loses nothing.
export type PendingCapture = {
  id: string // becomes the intake_jobs id
  batchId: string
  photo: Blob
  thumb: Blob
  quantity: number
  createdAt: number
}

const store = createStore('pantry-intake', 'pending')

export const savePending = (c: PendingCapture) => set(c.id, c, store)
export const removePending = (id: string) => del(id, store)
export async function loadPending(): Promise<PendingCapture[]> {
  const all = await entries<string, PendingCapture>(store)
  return all.map(([, c]) => c).sort((a, b) => a.createdAt - b.createdAt)
}
