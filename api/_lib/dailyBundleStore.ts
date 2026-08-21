import { list, put } from '@vercel/blob'
import { generateDailyBundle } from '../../shared/pathGeneration.js'
import { fetchPixabayVideos } from '../../shared/pixabay.js'
import type { DailyBundle } from '../../shared/types.js'

function bundlePathname(dateKey: string): string {
  return `bundles/${dateKey}.json`
}

/** Returns the day's bundle from Blob if the cron has already generated it, else null. */
export async function getStoredBundle(dateKey: string): Promise<DailyBundle | null> {
  const pathname = bundlePathname(dateKey)
  const { blobs } = await list({ prefix: pathname, limit: 1 })
  const existing = blobs.find((b) => b.pathname === pathname)
  if (!existing) return null

  const res = await fetch(existing.url)
  if (!res.ok) return null
  return (await res.json()) as DailyBundle
}

/**
 * Generates the day's bundle against live Pixabay and persists it to Blob under a fixed,
 * overwritable pathname (`addRandomSuffix: false` + `allowOverwrite: true`) so repeat calls
 * for the same `dateKey` — the cron re-running, or `getStoredBundle` racing a cold cache —
 * converge on one blob instead of accumulating duplicates.
 */
export async function generateAndStoreBundle(dateKey: string, apiKey: string): Promise<DailyBundle> {
  const bundle = await generateDailyBundle({
    dateKey,
    fetchCandidates: (category, perPage) =>
      fetchPixabayVideos({ category, perPage, safesearch: true }, apiKey),
  })

  await put(bundlePathname(dateKey), JSON.stringify(bundle), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })

  return bundle
}
