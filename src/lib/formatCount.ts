/** Formats large counts the way TikTok-style UIs do: 999 -> "999", 12345 -> "12.3K", 4200000 -> "4.2M". */
export function formatCount(n: number): string {
  const units: [number, string][] = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K'],
  ]
  for (const [threshold, suffix] of units) {
    if (n >= threshold) {
      const scaled = n / threshold
      const rounded = scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/\.0$/, '')
      return `${rounded}${suffix}`
    }
  }
  return String(n)
}
