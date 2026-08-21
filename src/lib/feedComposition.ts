import type { Post } from '../../shared/types'

/**
 * Unconditionally inserts the layer's guaranteed linking post into a filler batch at a
 * randomized position (not the edges), so the reachability guarantee doesn't look scripted.
 */
export function spliceLinkingPost(
  filler: Post[],
  linkingPost: Post,
  rng: () => number = Math.random,
): Post[] {
  const arr = [...filler]
  const minIndex = Math.min(3, arr.length)
  const maxIndex = Math.max(minIndex, arr.length - 2)
  const span = Math.max(1, maxIndex - minIndex)
  const insertAt = minIndex + Math.floor(rng() * span)
  arr.splice(insertAt, 0, linkingPost)
  return arr
}
