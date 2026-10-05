import { CATEGORIES, MAX_CATEGORIES, type Category } from '../../../shared/categories'

export { CATEGORIES, MAX_CATEGORIES }
export type { Category }

export const categoryLabel = (slug: string) => slug.replaceAll('_', ' ')

// Toggle a category in an ordered list (primary first). "other" is only valid on its own.
export function toggleCategory(current: Category[], c: Category): Category[] {
  if (current.includes(c)) return current.filter((x) => x !== c)
  if (c === 'other') return ['other']
  const without = current.filter((x) => x !== 'other')
  return without.length >= MAX_CATEGORIES ? without : [...without, c]
}
