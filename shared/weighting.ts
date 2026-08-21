import { PIXABAY_CATEGORIES, type PixabayCategory } from './categories.js'
import type { BatchSlot, Post, WeightState } from './types.js'
import { pick, type RandomFn, weightedPick } from './rng.js'

export const CATEGORY_BUMP = 1.2
export const CATEGORY_MAX = 5
export const TAG_BUMP = 1.15
export const TAG_MAX = 4
export const DEFAULT_DECAY_FACTOR = 0.9
export const SKIP_DECAY_FACTOR = 0.9

export function createInitialWeights(): WeightState {
  const categories = Object.fromEntries(
    PIXABAY_CATEGORIES.map((c) => [c, 1]),
  ) as Record<PixabayCategory, number>
  return { categories, tags: {} }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function tagKey(category: PixabayCategory, tag: string): string {
  return `${category}:${tag}`
}

/** Bumps the liked post's category weight and each of its (category-scoped) tag weights. */
export function applyLike(weights: WeightState, post: Post): WeightState {
  const categories = { ...weights.categories }
  categories[post.category] = clamp(
    categories[post.category] * CATEGORY_BUMP,
    1,
    CATEGORY_MAX,
  )

  const tags = { ...weights.tags }
  for (const tag of post.tags) {
    const key = tagKey(post.category, tag)
    tags[key] = clamp((tags[key] ?? 1) * TAG_BUMP, 1, TAG_MAX)
  }

  return { categories, tags }
}

/** Pulls all weights back toward 1 by `factor`. Call once per layer boundary, not per swipe. */
export function decay(
  weights: WeightState,
  factor = DEFAULT_DECAY_FACTOR,
): WeightState {
  const categories = { ...weights.categories }
  for (const c of PIXABAY_CATEGORIES) {
    categories[c] = 1 + (categories[c] - 1) * factor
  }

  const tags: Record<string, number> = {}
  for (const [key, value] of Object.entries(weights.tags)) {
    tags[key] = 1 + (value - 1) * factor
  }

  return { categories, tags }
}

/**
 * Pulls a single skipped post's category weight — and its (category-scoped) tag weights — back
 * toward 1 by `factor`, proportionally to how far above 1 they currently are. Call once per
 * scrolled-past-without-liking post. Unlike `decay`, this only touches the one post's category
 * and tags, not the whole state, and is meant to fire per skip rather than per layer boundary.
 * A never-liked category/tag is already exactly 1, so this is a no-op for it — no need to guard
 * on "was this ever liked" separately.
 */
export function applySkip(
  weights: WeightState,
  post: Post,
  factor = SKIP_DECAY_FACTOR,
): WeightState {
  const categories = { ...weights.categories }
  categories[post.category] = 1 + (categories[post.category] - 1) * factor

  const tags = { ...weights.tags }
  for (const tag of post.tags) {
    const key = tagKey(post.category, tag)
    if (key in tags) {
      tags[key] = 1 + (tags[key] - 1) * factor
    }
  }

  return { categories, tags }
}

export function normalizeCategoryDistribution(
  weights: WeightState,
): Record<PixabayCategory, number> {
  const total = PIXABAY_CATEGORIES.reduce(
    (sum, c) => sum + weights.categories[c],
    0,
  )
  return Object.fromEntries(
    PIXABAY_CATEGORIES.map((c) => [c, weights.categories[c] / total]),
  ) as Record<PixabayCategory, number>
}

function tagsForCategory(
  weights: WeightState,
  category: PixabayCategory,
): Record<string, number> {
  const prefix = `${category}:`
  const entries = Object.entries(weights.tags)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value] as const)
  return Object.fromEntries(entries)
}

function shuffle<T>(items: readonly T[], rng: RandomFn): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Largest-remainder apportionment: scales `guaranteed` counts down proportionally to weight so
 * they sum to exactly `capacity`, instead of overflowing it. Each category's proportional target
 * (`weight / totalWeight * capacity`) is floored, then leftover seats go to whoever's target had
 * the biggest fractional remainder. Ties in the remainder (e.g. every category equally weighted,
 * so every target has the same fractional part) are broken by a pre-shuffle, which degenerates
 * this into a uniform random pick of `capacity` categories — the same outcome plain proportional
 * sampling would give when weights are all equal.
 */
function apportion(
  guaranteed: Partial<Record<PixabayCategory, number>>,
  categoryWeights: Record<PixabayCategory, number>,
  capacity: number,
  rng: RandomFn,
): Partial<Record<PixabayCategory, number>> {
  const entries = Object.keys(guaranteed) as PixabayCategory[]
  const totalWeight = entries.reduce((sum, c) => sum + categoryWeights[c], 0)

  const targets = entries.map((category) => {
    const target = (categoryWeights[category] / totalWeight) * capacity
    return { category, floor: Math.floor(target), remainder: target - Math.floor(target) }
  })

  const assigned = targets.reduce((sum, t) => sum + t.floor, 0)
  const remaining = capacity - assigned

  const ordered = shuffle(targets, rng).sort((a, b) => b.remainder - a.remainder)
  for (let i = 0; i < remaining; i++) {
    ordered[i].floor += 1
  }

  const result: Partial<Record<PixabayCategory, number>> = {}
  for (const t of ordered) result[t.category] = t.floor
  return result
}

/**
 * Decides how many of the batch's slots each category gets:
 *  1. A category with weight > 1 is *guaranteed* `floor(weight)` slots — an untouched category
 *     (weight === 1 exactly, see `createInitialWeights`/`decay`) gets none.
 *  2. If guarantees alone would exceed `batchSize` (e.g. several categories all liked heavily),
 *     they're apportioned back down to fit via `apportion` rather than silently overflowing.
 *  3. Any slots left over after guarantees go to still-unexplored (weight === 1) categories,
 *     picked at random, so the batch keeps sampling new ground by default.
 *  4. Once every category has been touched at least once (no untouched ground left to explore),
 *     leftover slots instead go to the highest-remaining-weight categories in order, ties broken
 *     randomly (recency-based tie-breaking is TODO — deferred pending live playtesting).
 */
function allocateCategoryCounts(
  weights: WeightState,
  batchSize: number,
  rng: RandomFn,
): Partial<Record<PixabayCategory, number>> {
  const guaranteed: Partial<Record<PixabayCategory, number>> = {}
  let totalGuaranteed = 0
  for (const c of PIXABAY_CATEGORIES) {
    const w = weights.categories[c]
    const g = w > 1 ? Math.floor(w) : 0
    if (g > 0) {
      guaranteed[c] = g
      totalGuaranteed += g
    }
  }

  const counts =
    totalGuaranteed > batchSize
      ? apportion(guaranteed, weights.categories, batchSize, rng)
      : { ...guaranteed }

  const assigned = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
  const leftover = batchSize - assigned
  if (leftover <= 0) return counts

  const untouched = PIXABAY_CATEGORIES.filter((c) => weights.categories[c] === 1)
  if (untouched.length > 0) {
    for (let i = 0; i < leftover; i++) {
      const category = pick(untouched, rng)
      counts[category] = (counts[category] ?? 0) + 1
    }
    return counts
  }

  // Nothing left unexplored — fall back to highest weight first, ties broken by the shuffle
  // (a stable sort preserves shuffled order among equal weights).
  const ranked = shuffle(PIXABAY_CATEGORIES, rng).sort(
    (a, b) => weights.categories[b] - weights.categories[a],
  )
  for (let i = 0; i < leftover; i++) {
    const category = ranked[i % ranked.length]
    counts[category] = (counts[category] ?? 0) + 1
  }
  return counts
}

/** Picks `batchSize` (category, tag-query) slots — see `allocateCategoryCounts` for the category
 *  mix, and `tagsForCategory`/`weightedPick` for the (unchanged) weighted tag pick within it. */
export function pickNextBatchMix(
  weights: WeightState,
  batchSize: number,
  rng: RandomFn,
): BatchSlot[] {
  const counts = allocateCategoryCounts(weights, batchSize, rng)
  const slots: BatchSlot[] = []
  for (const category of PIXABAY_CATEGORIES) {
    const count = counts[category] ?? 0
    for (let i = 0; i < count; i++) {
      const tagWeights = tagsForCategory(weights, category)
      const tagQuery =
        Object.keys(tagWeights).length > 0
          ? weightedPick(tagWeights, rng)
          : undefined
      slots.push({ category, tagQuery })
    }
  }
  return shuffle(slots, rng)
}
