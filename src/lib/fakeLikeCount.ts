import { createSeededRng, hashStringToSeed } from '../../shared/rng.js'

/**
 * Deterministic per-post "like count" for the TikTok-style display next to the like button.
 * Cosmetic only — not real engagement data. Cubed so most posts land in the low thousands with
 * occasional viral-looking outliers, seeded off the post id so it stays stable across re-renders.
 */
export function fakeLikeCount(postId: number): number {
  const rng = createSeededRng(hashStringToSeed(`likes:${postId}`))
  return Math.floor(rng() ** 3 * 2_000_000) + 12
}
