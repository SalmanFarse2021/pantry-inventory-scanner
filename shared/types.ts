import type { PixabayCategory } from './categories.js'

export interface VideoRendition {
  url: string
  width: number
  height: number
  thumbnail: string
}

export interface Post {
  id: number
  category: PixabayCategory
  tags: string[]
  rawTags: string
  duration: number
  video: {
    medium: VideoRendition
    small: VideoRendition
  }
  attribution: {
    user: string
    userId: number
    pageURL: string
  }
}

export interface WeightState {
  categories: Record<PixabayCategory, number>
  /** Keyed `${category}:${tag}`, not by tag alone — the same tag under different categories
   *  (e.g. "sunset" on a nature vs. travel video) is tracked independently. See weighting.ts. */
  tags: Record<string, number>
}

export interface SwipeEvent {
  postId: number
  direction: 'up' | 'down'
  timestampMs: number
  liked: boolean
}

export type GameStatus = 'splash' | 'goal-preview' | 'feed' | 'won' | 'lost'

export interface PathPivot {
  layerIndex: number
  category: PixabayCategory
  tagHint?: string
  linkingPost: Post
}

export interface DailyBundle {
  date: string
  goal: Post
  goalTagsPreview: string[]
  /** pathChain[pathChain.length - 1].linkingPost is always `goal` itself — see pathGeneration.ts. */
  pathChain: PathPivot[]
  seed: number
  generatedAt: string
  pixabayAttributionNote: string
}

export interface BatchSlot {
  category: PixabayCategory
  tagQuery?: string
}
