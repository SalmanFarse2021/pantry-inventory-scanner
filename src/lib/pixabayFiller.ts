import { pickNextBatchMix } from '../../shared/weighting'
import type { PixabayCategory } from '../../shared/categories'
import type { BatchSlot, Post, WeightState } from '../../shared/types'

interface BatchGroup {
  category: PixabayCategory
  tagQuery?: string
  count: number
}

// pickNextBatchMix returns one (category, tag) slot per post, sampled independently — collapsing
// repeats into groups keeps this to a handful of requests per layer instead of one per post
// (batchSize could be 10+), and each distinct (category, q) pair is exactly what the proxy's
// Cache-Control lets Vercel's CDN serve for free on repeat.
function groupSlots(slots: BatchSlot[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>()
  for (const slot of slots) {
    const key = `${slot.category}::${slot.tagQuery ?? ''}`
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { category: slot.category, tagQuery: slot.tagQuery, count: 1 })
  }
  return [...groups.values()]
}

async function fetchGroup(group: BatchGroup): Promise<Post[]> {
  // Over-fetch (2x the needed count, floor of 10) so the final shuffle has real variety to pick
  // from instead of returning the same top-ranked "popular" hits verbatim every time.
  const params = new URLSearchParams({
    category: group.category,
    perPage: String(Math.min(200, Math.max(group.count * 2, 10))),
  })
  if (group.tagQuery) params.set('q', group.tagQuery)

  const res = await fetch(`/api/feed/batch?${params.toString()}`)
  if (!res.ok) return []
  const data = (await res.json()) as { posts: Post[] }
  return data.posts
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Real filler fetcher, wired against the live weighting algorithm: samples a category+tag mix
 * from current weights, fetches each distinct group through the server-side Pixabay proxy
 * (never calls Pixabay directly from the client), then merges/dedupes/shuffles into one batch.
 *
 * `excludeIds` should cover every post id already placed in the feed (earlier layers) plus every
 * pinned linking post (past or still upcoming) — without it, a post can recur across layers once
 * a heavily-weighted category/tag narrows Pixabay's result pool, colliding on React's `key`.
 */
export async function fetchWeightedFillerBatch(
  weights: WeightState,
  batchSize: number,
  excludeIds: ReadonlySet<number> = new Set(),
): Promise<Post[]> {
  const slots = pickNextBatchMix(weights, batchSize, Math.random)
  const groups = groupSlots(slots)
  const results = await Promise.all(groups.map(fetchGroup))

  const seen = new Set<number>(excludeIds)
  const pool: Post[] = []
  for (const posts of results) {
    for (const post of posts) {
      if (!seen.has(post.id)) {
        seen.add(post.id)
        pool.push(post)
      }
    }
  }

  return shuffle(pool).slice(0, batchSize)
}
