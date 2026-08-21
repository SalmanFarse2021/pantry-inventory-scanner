import type { DailyBundle } from '../../shared/types'
import { todayUtcKey } from '../../shared/dailyKey'
import { mockDailyBundle } from './mockBundle'

type BundleSource = 'mock' | 'local' | 'remote'

function resolveSource(): BundleSource {
  const raw = import.meta.env.VITE_BUNDLE_SOURCE
  if (raw === 'local' || raw === 'remote') return raw
  return 'mock'
}

/**
 * 'mock' (default, no server needed) uses a hand-authored fixture for UI development.
 * 'local' reads a bundle written by `scripts/generate-bundle-local.ts` without touching Blob.
 * 'remote' hits the deployed `/api/bundle/today` function backed by the daily cron job.
 */
export async function fetchDailyBundle(): Promise<DailyBundle> {
  const source = resolveSource()
  const dateKey = todayUtcKey()

  if (source === 'mock') {
    return { ...mockDailyBundle, date: dateKey }
  }

  if (source === 'local') {
    const res = await fetch(`/dev-bundles/${dateKey}.json`)
    if (!res.ok) throw new Error(`No local dev bundle found for ${dateKey}`)
    return res.json()
  }

  const res = await fetch('/api/bundle/today')
  if (!res.ok) throw new Error(`Failed to fetch daily bundle: ${res.status}`)
  return res.json()
}
