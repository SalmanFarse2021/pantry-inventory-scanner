// Deterministic per-category placeholder color, used until real Pixabay video is wired in.
// Shared by VideoCard (feed) and the goal-preview screen so both render the same look.
export function placeholderGradient(category: string): string {
  let hash = 0
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return `linear-gradient(160deg, hsl(${hue}, 60%, 35%), hsl(${(hue + 60) % 360}, 55%, 20%))`
}
