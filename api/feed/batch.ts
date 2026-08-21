import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PIXABAY_CATEGORIES, type PixabayCategory } from '../../shared/categories.js'
import { fetchPixabayVideos, isValidVideoHit, normalizePixabayVideo } from '../../shared/pixabay.js'
import type { Post } from '../../shared/types.js'

function isPixabayCategory(value: unknown): value is PixabayCategory {
  return typeof value === 'string' && (PIXABAY_CATEGORIES as readonly string[]).includes(value)
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function clampPerPage(n: number): number {
  if (!Number.isFinite(n)) return 20
  return Math.min(200, Math.max(3, Math.round(n)))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'PIXABAY_API_KEY is not configured' })
    return
  }

  const categoryParam = firstParam(req.query.category as string | string[] | undefined)
  if (!isPixabayCategory(categoryParam)) {
    res.status(400).json({ error: 'category is required and must be a valid Pixabay category' })
    return
  }
  const category = categoryParam

  const q = firstParam(req.query.q as string | string[] | undefined) || undefined
  const perPage = clampPerPage(Number(firstParam(req.query.perPage as string | string[] | undefined)))

  try {
    const hits = await fetchPixabayVideos({ category, q, perPage, safesearch: true }, apiKey)
    const posts: Post[] = hits.filter(isValidVideoHit).map((hit) => normalizePixabayVideo(hit, category))

    // Satisfies Pixabay's 24h-caching requirement and lets Vercel's CDN absorb repeated
    // (category, q) requests across players, raising effective throughput past the raw
    // per-key rate limit.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600')
    res.status(200).json({ posts })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Pixabay request failed' })
  }
}
