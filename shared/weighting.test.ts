import { describe, expect, it } from 'vitest'
import { PIXABAY_CATEGORIES } from './categories'
import type { Post } from './types'
import {
  CATEGORY_MAX,
  applyLike,
  applySkip,
  createInitialWeights,
  decay,
  normalizeCategoryDistribution,
  pickNextBatchMix,
} from './weighting'

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    category: 'food',
    tags: ['burger', 'snack'],
    rawTags: 'burger, snack',
    duration: 10,
    video: {
      medium: { url: 'https://example.com/medium.mp4', width: 1280, height: 720, thumbnail: '' },
      small: { url: 'https://example.com/small.mp4', width: 640, height: 360, thumbnail: '' },
    },
    attribution: { user: 'someone', userId: 1, pageURL: 'https://pixabay.com' },
    ...overrides,
  }
}

describe('createInitialWeights', () => {
  it('sets every category to weight 1 and no tags', () => {
    const weights = createInitialWeights()
    for (const c of PIXABAY_CATEGORIES) {
      expect(weights.categories[c]).toBe(1)
    }
    expect(Object.keys(weights.tags)).toHaveLength(0)
  })
})

describe('applyLike', () => {
  it('bumps the liked post category and its tags, scoped by category', () => {
    const weights = createInitialWeights()
    const next = applyLike(weights, makePost())

    expect(next.categories.food).toBeCloseTo(1.2)
    expect(next.categories.nature).toBe(1)
    expect(next.tags['food:burger']).toBeCloseTo(1.15)
    expect(next.tags['food:snack']).toBeCloseTo(1.15)
  })

  it('does not mutate the input weight state', () => {
    const weights = createInitialWeights()
    applyLike(weights, makePost())
    expect(weights.categories.food).toBe(1)
  })

  it('clamps category weight at CATEGORY_MAX', () => {
    let weights = createInitialWeights()
    for (let i = 0; i < 50; i++) weights = applyLike(weights, makePost())
    expect(weights.categories.food).toBeLessThanOrEqual(CATEGORY_MAX)
  })

  it('keeps the same tag scoped to different categories independent', () => {
    let weights = createInitialWeights()
    weights = applyLike(weights, makePost({ category: 'nature', tags: ['sunset'] }))
    expect(weights.tags['nature:sunset']).toBeCloseTo(1.15)
    expect(weights.tags['travel:sunset']).toBeUndefined()
  })
})

describe('decay', () => {
  it('pulls weights back toward 1', () => {
    let weights = createInitialWeights()
    weights = applyLike(weights, makePost())
    const decayed = decay(weights, 0.5)
    expect(decayed.categories.food).toBeCloseTo(1 + (weights.categories.food - 1) * 0.5)
    expect(decayed.tags['food:burger']).toBeCloseTo(1 + (weights.tags['food:burger'] - 1) * 0.5)
  })
})

describe('normalizeCategoryDistribution', () => {
  it('sums to 1 across all categories', () => {
    let weights = createInitialWeights()
    weights = applyLike(weights, makePost())
    const dist = normalizeCategoryDistribution(weights)
    const total = Object.values(dist).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1)
  })
})

describe('applySkip', () => {
  it('pulls the skipped post category and its tags back toward 1, proportionally', () => {
    let weights = createInitialWeights()
    weights = applyLike(weights, makePost())
    const before = weights.categories.food

    const skipped = applySkip(weights, makePost(), 0.9)
    expect(skipped.categories.food).toBeCloseTo(1 + (before - 1) * 0.9)
    expect(skipped.tags['food:burger']).toBeCloseTo(1 + (weights.tags['food:burger'] - 1) * 0.9)
  })

  it('is a no-op for a never-liked category/tag (already at baseline 1)', () => {
    const weights = createInitialWeights()
    const skipped = applySkip(weights, makePost())
    expect(skipped.categories.food).toBe(1)
    expect(Object.keys(skipped.tags)).toHaveLength(0)
  })

  it('never pushes weight below 1, even after many skips', () => {
    let weights = createInitialWeights()
    for (let i = 0; i < 50; i++) weights = applyLike(weights, makePost())
    for (let i = 0; i < 200; i++) weights = applySkip(weights, makePost(), 0.9)
    expect(weights.categories.food).toBeGreaterThanOrEqual(1)
  })

  it('does not mutate the input weight state', () => {
    let weights = createInitialWeights()
    weights = applyLike(weights, makePost())
    const before = weights.categories.food
    applySkip(weights, makePost())
    expect(weights.categories.food).toBe(before)
  })

  it('leaves other categories and tags untouched', () => {
    let weights = createInitialWeights()
    weights = applyLike(weights, makePost())
    weights = applyLike(weights, makePost({ category: 'nature', tags: ['sunset'] }))
    const skipped = applySkip(weights, makePost())
    expect(skipped.categories.nature).toBeCloseTo(weights.categories.nature)
    expect(skipped.tags['nature:sunset']).toBeCloseTo(weights.tags['nature:sunset'])
  })
})

describe('pickNextBatchMix', () => {
  let rngState = 42
  const rng = () => {
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff
    return rngState / 0x7fffffff
  }

  it('produces exactly batchSize slots', () => {
    const weights = createInitialWeights()
    const slots = pickNextBatchMix(weights, 10, rng)
    expect(slots).toHaveLength(10)
  })

  it('guarantees floor(weight) slots for a liked category, deterministically', () => {
    let weights = createInitialWeights()
    for (let i = 0; i < 10; i++) weights = applyLike(weights, makePost())
    expect(weights.categories.food).toBe(CATEGORY_MAX) // 5

    const slots = pickNextBatchMix(weights, 10, rng)
    const foodCount = slots.filter((s) => s.category === 'food').length
    expect(foodCount).toBeGreaterThanOrEqual(5)
  })

  it('gives an untouched category zero guaranteed slots', () => {
    let weights = createInitialWeights()
    for (let i = 0; i < 10; i++) weights = applyLike(weights, makePost())
    // nature was never liked, so it only ever appears via the random leftover-slot pool, not a
    // guarantee — run many trials and confirm it's never overrepresented relative to the other
    // 18 untouched categories sharing the leftover slots.
    let natureCount = 0
    for (let trial = 0; trial < 500; trial++) {
      const slots = pickNextBatchMix(weights, 10, rng)
      natureCount += slots.filter((s) => s.category === 'nature').length
    }
    // 5 leftover slots per batch spread uniformly across 19 untouched categories.
    const expected = (500 * 5) / 19
    expect(natureCount).toBeLessThan(expected * 1.5)
  })

  it('reconciles overflowing guarantees down to batchSize when multiple categories are heavily liked', () => {
    let weights = createInitialWeights()
    for (let i = 0; i < 10; i++) weights = applyLike(weights, makePost({ category: 'food' }))
    for (let i = 0; i < 10; i++) weights = applyLike(weights, makePost({ category: 'nature', tags: [] }))
    // Both categories maxed at 5 -> 10 guaranteed slots exactly fills a batch of 10.
    const slots = pickNextBatchMix(weights, 10, rng)
    expect(slots).toHaveLength(10)
    const foodCount = slots.filter((s) => s.category === 'food').length
    const natureCount = slots.filter((s) => s.category === 'nature').length
    expect(foodCount + natureCount).toBe(10)
  })
})
