import type { VercelRequest, VercelResponse } from '@vercel/node'
import { todayUtcKey } from '../../shared/dailyKey.js'
import { generateAndStoreBundle } from '../_lib/dailyBundleStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Vercel signs cron-triggered requests with this header when CRON_SECRET is set on the
  // project. Skipped (not required) when unset, so the endpoint stays manually triggerable
  // in environments that haven't configured it yet.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'PIXABAY_API_KEY is not configured' })
    return
  }

  try {
    const dateKey = todayUtcKey()
    const bundle = await generateAndStoreBundle(dateKey, apiKey)
    res.status(200).json({ ok: true, date: dateKey, goalCategory: bundle.goal.category })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Bundle generation failed' })
  }
}
