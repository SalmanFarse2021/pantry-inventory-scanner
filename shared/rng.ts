/** Deterministic string -> uint32 hash (djb2 variant), used to seed the RNG from a date key. */
export function hashStringToSeed(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

/** mulberry32 PRNG: fast, deterministic, good enough for gameplay (not cryptographic). */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type RandomFn = () => number

export function pick<T>(items: readonly T[], rng: RandomFn): T {
  if (items.length === 0) throw new Error('pick: items is empty')
  return items[Math.floor(rng() * items.length)]
}

export function weightedPick<T extends string>(
  weights: Record<T, number>,
  rng: RandomFn,
): T {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng() * total
  for (const [key, weight] of entries) {
    roll -= weight
    if (roll <= 0) return key
  }
  return entries[entries.length - 1][0]
}
