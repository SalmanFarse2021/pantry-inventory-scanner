import type { DailyBundle, PathPivot, Post } from '../../shared/types'
import { PIXABAY_ATTRIBUTION_NOTE } from '../../shared/pathGeneration'
import type { PixabayCategory } from '../../shared/categories'

let nextId = 1

function mockPost(category: PixabayCategory, tags: string[]): Post {
  return {
    id: nextId++,
    category,
    tags,
    rawTags: tags.join(', '),
    duration: 12,
    video: {
      medium: { url: '', width: 1280, height: 720, thumbnail: '' },
      small: { url: '', width: 640, height: 360, thumbnail: '' },
    },
    attribution: { user: 'mock-user', userId: 0, pageURL: '' },
  }
}

const goal = mockPost('travel', ['lighthouse', 'coast', 'sunset'])

const pathChain: PathPivot[] = [
  { layerIndex: 0, category: 'food', tagHint: 'ramen', linkingPost: mockPost('food', ['ramen', 'noodles']) },
  { layerIndex: 1, category: 'nature', tagHint: 'forest', linkingPost: mockPost('nature', ['forest', 'fog']) },
  { layerIndex: 2, category: 'animals', tagHint: 'seagull', linkingPost: mockPost('animals', ['seagull', 'coast']) },
  { layerIndex: 3, category: 'places', tagHint: 'harbor', linkingPost: mockPost('places', ['harbor', 'boats']) },
  { layerIndex: 4, category: 'travel', tagHint: 'lighthouse', linkingPost: goal },
]

export const mockDailyBundle: DailyBundle = {
  date: '2026-08-20',
  goal,
  goalTagsPreview: goal.tags,
  pathChain,
  seed: 0,
  generatedAt: new Date(0).toISOString(),
  pixabayAttributionNote: PIXABAY_ATTRIBUTION_NOTE,
}

const FILLER_CATEGORIES: { category: PixabayCategory; tags: string[] }[] = [
  { category: 'sports', tags: ['soccer', 'stadium'] },
  { category: 'music', tags: ['guitar', 'concert'] },
  { category: 'business', tags: ['office', 'meeting'] },
  { category: 'fashion', tags: ['runway', 'model'] },
  { category: 'science', tags: ['lab', 'microscope'] },
  { category: 'computer', tags: ['keyboard', 'code'] },
]

export function mockFillerBatch(count: number): Post[] {
  return Array.from({ length: count }, (_, i) => {
    const { category, tags } = FILLER_CATEGORIES[i % FILLER_CATEGORIES.length]
    return mockPost(category, tags)
  })
}
