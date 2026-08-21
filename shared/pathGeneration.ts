import { PIXABAY_CATEGORIES, type PixabayCategory } from './categories.js'
import { isValidVideoHit, normalizePixabayVideo, splitTags, type PixabayVideoHit } from './pixabay.js'
import { createSeededRng, hashStringToSeed, pick, type RandomFn } from './rng.js'
import type { DailyBundle, PathPivot } from './types.js'

export type FetchCandidates = (
  category: PixabayCategory,
  perPage: number,
) => Promise<PixabayVideoHit[]>

const CANDIDATES_PER_PAGE = 20

export const PIXABAY_ATTRIBUTION_NOTE =
  'Videos provided by Pixabay (pixabay.com) under the Pixabay Content License.'

function shuffle<T>(items: readonly T[], rng: RandomFn): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function modeTag(hits: PixabayVideoHit[]): string | undefined {
  const counts = new Map<string, number>()
  for (const hit of hits) {
    for (const tag of splitTags(hit.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  let best: string | undefined
  let bestCount = 0
  for (const [tag, count] of counts) {
    if (count > bestCount) {
      best = tag
      bestCount = count
    }
  }
  return best
}

/** Tries unused categories, in a seeded-shuffled order, until one yields a valid candidate pool. */
async function pickCategoryWithCandidates(
  excluded: Set<PixabayCategory>,
  fetchCandidates: FetchCandidates,
  rng: RandomFn,
): Promise<{ category: PixabayCategory; candidates: PixabayVideoHit[] }> {
  const pool = PIXABAY_CATEGORIES.filter((c) => !excluded.has(c))
  for (const category of shuffle(pool, rng)) {
    const candidates = (await fetchCandidates(category, CANDIDATES_PER_PAGE)).filter(
      isValidVideoHit,
    )
    if (candidates.length > 0) return { category, candidates }
  }
  throw new Error(
    `pathGeneration: no unused category yielded a valid candidate pool (${excluded.size} already excluded)`,
  )
}

/**
 * Builds the day's guaranteed-reachable path: `layerCount` distinct categories, one real
 * sampled video pinned as each layer's unconditional "linking post", with the final layer's
 * linking post being the goal itself. A player who never likes anything correctly still
 * encounters every pivot while scrolling forward, so the goal is always reached within
 * `layerCount` layers regardless of play style.
 */
export async function generateDailyBundle(opts: {
  dateKey: string
  fetchCandidates: FetchCandidates
  layerCount?: number
}): Promise<DailyBundle> {
  const { dateKey, fetchCandidates, layerCount = 5 } = opts
  if (layerCount < 1 || layerCount > PIXABAY_CATEGORIES.length) {
    throw new Error(
      `layerCount must be between 1 and ${PIXABAY_CATEGORIES.length}, got ${layerCount}`,
    )
  }

  const rng = createSeededRng(hashStringToSeed(dateKey))
  const usedCategories = new Set<PixabayCategory>()

  const { category: goalCategory, candidates: goalCandidates } =
    await pickCategoryWithCandidates(usedCategories, fetchCandidates, rng)
  usedCategories.add(goalCategory)
  const goalHit = pick(goalCandidates, rng)
  const goal = normalizePixabayVideo(goalHit, goalCategory)

  const pivots: PathPivot[] = [
    {
      layerIndex: layerCount - 1,
      category: goalCategory,
      tagHint: goal.tags[0],
      linkingPost: goal,
    },
  ]

  for (let layerIndex = layerCount - 2; layerIndex >= 0; layerIndex--) {
    const { category, candidates } = await pickCategoryWithCandidates(
      usedCategories,
      fetchCandidates,
      rng,
    )
    usedCategories.add(category)
    const hit = pick(candidates, rng)
    const linkingPost = normalizePixabayVideo(hit, category)
    pivots.unshift({
      layerIndex,
      category,
      tagHint: modeTag(candidates) ?? linkingPost.tags[0],
      linkingPost,
    })
  }

  return {
    date: dateKey,
    goal,
    goalTagsPreview: goal.tags,
    pathChain: pivots,
    seed: hashStringToSeed(dateKey),
    generatedAt: new Date().toISOString(),
    pixabayAttributionNote: PIXABAY_ATTRIBUTION_NOTE,
  }
}
