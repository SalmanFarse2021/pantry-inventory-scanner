import { create } from 'zustand'
import { applyLike, applySkip, createInitialWeights, decay as decayWeights } from '../../shared/weighting'
import type { DailyBundle, GameStatus, Post, SwipeEvent, WeightState } from '../../shared/types'

interface GameStoreState {
  status: GameStatus
  bundle: DailyBundle | null
  brainrot: number
  hotCold: number
  currentLayer: number
  weights: WeightState
  swipeHistory: SwipeEvent[]
  likedPostIds: Set<number>
  feedPosts: Post[]
  currentPostId: number | null

  loadBundle: (bundle: DailyBundle) => void
  startFeed: () => void
  appendPosts: (posts: Post[]) => void
  advanceLayer: () => void
  likePost: (post: Post) => void
  skipPost: (post: Post) => void
  recordSwipe: (event: SwipeEvent) => void
  setCurrentPostId: (postId: number | null) => void
  setBrainrot: (value: number) => void
  setHotCold: (value: number) => void
  win: () => void
  lose: () => void
  reset: () => void
}

// Everything that resets between rounds (first play, or a retry after losing) but is NOT part
// of the daily bundle itself — the bundle/goal/path stay fixed for the whole UTC day so a retry
// replays the same target rather than rerolling it.
function freshRoundState() {
  return {
    brainrot: 100,
    hotCold: 0,
    currentLayer: 0,
    weights: createInitialWeights(),
    swipeHistory: [] as SwipeEvent[],
    likedPostIds: new Set<number>(),
    feedPosts: [] as Post[],
    currentPostId: null as number | null,
  }
}

export const useGameStore = create<GameStoreState>((set) => ({
  status: 'splash',
  bundle: null,
  ...freshRoundState(),

  loadBundle: (bundle) => set({ bundle, status: 'goal-preview' }),

  startFeed: () => set({ status: 'feed', ...freshRoundState() }),

  appendPosts: (posts) =>
    set((state) => ({ feedPosts: [...state.feedPosts, ...posts] })),

  // Weight decay is coupled to layer advancement (once per fetched batch), not to every swipe —
  // a burst of likes within one layer should still bias that layer's batch strongly; decay only
  // pulls things back toward neutral once we move on to the next one.
  advanceLayer: () =>
    set((state) => ({
      currentLayer: state.currentLayer + 1,
      weights: decayWeights(state.weights),
    })),

  likePost: (post) =>
    set((state) => ({
      weights: applyLike(state.weights, post),
      likedPostIds: new Set(state.likedPostIds).add(post.id),
    })),

  // Scrolled past without a like — pulls that post's category/tag weights back toward neutral so
  // an oversaturated category cools off over time, without waiting for the next layer's decay().
  skipPost: (post) =>
    set((state) => ({
      weights: applySkip(state.weights, post),
    })),

  recordSwipe: (event) =>
    set((state) => ({ swipeHistory: [...state.swipeHistory, event] })),

  setCurrentPostId: (postId) => set({ currentPostId: postId }),

  setBrainrot: (value) => set({ brainrot: Math.max(0, Math.min(100, value)) }),

  setHotCold: (value) => set({ hotCold: Math.max(0, Math.min(100, value)) }),

  win: () => set({ status: 'won' }),

  lose: () => set({ status: 'lost' }),

  reset: () => set({ status: 'splash', bundle: null, ...freshRoundState() }),
}))
