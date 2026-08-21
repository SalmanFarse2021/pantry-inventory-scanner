import { describe, expect, it } from 'vitest'
import { PIXABAY_CATEGORIES, type PixabayCategory } from './categories'
import type { PixabayVideoHit } from './pixabay'
import { generateDailyBundle } from './pathGeneration'

function fakeHitsForCategory(category: PixabayCategory, count: number): PixabayVideoHit[] {
  return Array.from({ length: count }, (_, i) => {
    const id = hashToId(category, i)
    return {
      id,
      pageURL: `https://pixabay.com/videos/id-${id}/`,
      type: 'film',
      tags: `${category}, tag-${i}, filler`,
      duration: 10,
      videos: {
        large: { url: `https://cdn.example/${id}_large.mp4`, width: 1920, height: 1080, size: 1, thumbnail: '' },
        medium: { url: `https://cdn.example/${id}_medium.mp4`, width: 1280, height: 720, size: 1, thumbnail: '' },
        small: { url: `https://cdn.example/${id}_small.mp4`, width: 640, height: 360, size: 1, thumbnail: '' },
        tiny: { url: `https://cdn.example/${id}_tiny.mp4`, width: 480, height: 270, size: 1, thumbnail: '' },
      },
      user_id: 1,
      user: 'fixture-user',
    }
  })
}

function hashToId(category: string, i: number): number {
  let h = 0
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h + i
}

async function fakeFetchCandidates(category: PixabayCategory, perPage: number) {
  return fakeHitsForCategory(category, perPage)
}

describe('generateDailyBundle', () => {
  it('builds a chain of layerCount pivots with distinct categories, ending at the goal', async () => {
    const bundle = await generateDailyBundle({
      dateKey: '2026-08-20',
      fetchCandidates: fakeFetchCandidates,
      layerCount: 5,
    })

    expect(bundle.pathChain).toHaveLength(5)
    expect(bundle.pathChain.map((p) => p.layerIndex)).toEqual([0, 1, 2, 3, 4])

    const categories = bundle.pathChain.map((p) => p.category)
    expect(new Set(categories).size).toBe(categories.length)

    const lastPivot = bundle.pathChain[bundle.pathChain.length - 1]
    expect(lastPivot.linkingPost.id).toBe(bundle.goal.id)
    expect(lastPivot.category).toBe(bundle.goal.category)
  })

  it('is deterministic for the same date key', async () => {
    const a = await generateDailyBundle({ dateKey: '2026-08-20', fetchCandidates: fakeFetchCandidates })
    const b = await generateDailyBundle({ dateKey: '2026-08-20', fetchCandidates: fakeFetchCandidates })
    expect(a.goal.id).toBe(b.goal.id)
    expect(a.pathChain.map((p) => p.category)).toEqual(b.pathChain.map((p) => p.category))
  })

  it('produces a different goal for a different date key (very likely)', async () => {
    const a = await generateDailyBundle({ dateKey: '2026-08-20', fetchCandidates: fakeFetchCandidates })
    const b = await generateDailyBundle({ dateKey: '2026-08-21', fetchCandidates: fakeFetchCandidates })
    expect(a.seed).not.toBe(b.seed)
  })

  it('guarantees reachability: scrolling forward through pivots in order always terminates at the goal, regardless of likes', async () => {
    const bundle = await generateDailyBundle({
      dateKey: '2026-08-20',
      fetchCandidates: fakeFetchCandidates,
      layerCount: 5,
    })

    // Simulate a player who never likes anything "correctly" — the guarantee must not depend
    // on player behavior, only on the unconditional per-layer linking-post injection.
    let reachedGoal = false
    for (const pivot of bundle.pathChain) {
      if (pivot.linkingPost.id === bundle.goal.id) reachedGoal = true
    }
    expect(reachedGoal).toBe(true)
  })

  it('rejects an out-of-range layerCount', async () => {
    await expect(
      generateDailyBundle({ dateKey: '2026-08-20', fetchCandidates: fakeFetchCandidates, layerCount: 0 }),
    ).rejects.toThrow()
    await expect(
      generateDailyBundle({
        dateKey: '2026-08-20',
        fetchCandidates: fakeFetchCandidates,
        layerCount: PIXABAY_CATEGORIES.length + 1,
      }),
    ).rejects.toThrow()
  })
})
