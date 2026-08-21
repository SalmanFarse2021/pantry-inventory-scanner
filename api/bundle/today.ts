import type { VercelRequest, VercelResponse } from '@vercel/node'
import { todayUtcKey } from '../../shared/dailyKey.js'
import { generateAndStoreBundle, getStoredBundle } from '../_lib/dailyBundleStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const dateKey = todayUtcKey()

  try {
    const stored = await getStoredBundle(dateKey)
    if (stored) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600')
      res.status(200).json(stored)
      return
    }

    // Self-heals when the cron hasn't produced today's bundle yet (deploy day, cron delay, a
    // prior failure) — the game's reachability guarantee shouldn't depend on cron timing, so
    // the first request of the day pays the generation cost instead of the player seeing an error.
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'PIXABAY_API_KEY is not configured' })
      return
    }
    const bundle = await generateAndStoreBundle(dateKey, apiKey)
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600')
    res.status(200).json(bundle)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to load daily bundle' })
  }
}
