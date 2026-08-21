import { useEffect, useRef, useState } from 'react'
import type { Post, WeightState } from '../../../shared/types'
import { useGameStore } from '../../game/gameStore'
import { spliceLinkingPost } from '../../lib/feedComposition'
import { mockFillerBatch } from '../../lib/mockBundle'
import { fakeLikeCount } from '../../lib/fakeLikeCount'
import { VideoCard } from './VideoCard'
import { LikeButton } from './LikeButton'
import { BrainrotMeter } from '../meters/BrainrotMeter'
import { HotColdMeter } from '../meters/HotColdMeter'
import { ScrollTimer } from '../meters/ScrollTimer'

const FILLER_BATCH_SIZE = 10
const NEAR_END_THRESHOLD = 3
const BRAINROT_DECAY_PER_SWIPE = 1
// How many cards get real content mounted around the active one (1 = active + prev + next = 3 total).
const RENDER_WINDOW_RADIUS = 1

export type FillerFetcher = (
  weights: WeightState,
  batchSize: number,
  excludeIds: ReadonlySet<number>,
) => Promise<Post[]> | Post[]

const defaultFillerFetcher: FillerFetcher = (_weights, n) => mockFillerBatch(n)

export function FeedList({ fillerFetcher = defaultFillerFetcher }: { fillerFetcher?: FillerFetcher }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const prevPostIdRef = useRef<number | null>(null)
  // Layer indices we've already requested (or fully loaded) — a synchronous test-and-set guard
  // so React StrictMode's double-effect-firing (or an overlapping near-end trigger) can't append
  // the same layer's linking post twice.
  const requestedLayersRef = useRef<Set<number>>(new Set())

  const bundle = useGameStore((s) => s.bundle)
  const status = useGameStore((s) => s.status)
  const feedPosts = useGameStore((s) => s.feedPosts)
  const currentLayer = useGameStore((s) => s.currentLayer)
  const currentPostId = useGameStore((s) => s.currentPostId)
  const brainrot = useGameStore((s) => s.brainrot)
  const hotCold = useGameStore((s) => s.hotCold)
  const weights = useGameStore((s) => s.weights)
  const likedPostIds = useGameStore((s) => s.likedPostIds)

  const appendPosts = useGameStore((s) => s.appendPosts)
  const advanceLayer = useGameStore((s) => s.advanceLayer)
  const setCurrentPostId = useGameStore((s) => s.setCurrentPostId)
  const setBrainrot = useGameStore((s) => s.setBrainrot)
  const setHotCold = useGameStore((s) => s.setHotCold)
  const recordSwipe = useGameStore((s) => s.recordSwipe)
  const likePost = useGameStore((s) => s.likePost)
  const skipPost = useGameStore((s) => s.skipPost)
  const win = useGameStore((s) => s.win)
  const lose = useGameStore((s) => s.lose)

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Counts up from 0:00 for the ScrollTimer, starting once the feed screen mounts.
  useEffect(() => {
    if (status !== 'feed') return
    const startedAt = Date.now()
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [status])

  const ensureLayerLoaded = async (layerIndex: number) => {
    if (!bundle) return
    // pathChain's last layer's linkingPost IS the goal, so once we've requested every layer the
    // goal is guaranteed to already be in the feed — no further layers are ever needed.
    if (layerIndex >= bundle.pathChain.length) return
    if (requestedLayersRef.current.has(layerIndex)) return
    requestedLayersRef.current.add(layerIndex)

    const pivot = bundle.pathChain[layerIndex]
    // Every post already in the feed, plus every pinned linking post (past or still upcoming) —
    // a filler post matching either would collide on React's key once it lands.
    const excludeIds = new Set<number>(feedPosts.map((p) => p.id))
    for (const p of bundle.pathChain) excludeIds.add(p.linkingPost.id)
    const filler = await fillerFetcher(weights, FILLER_BATCH_SIZE, excludeIds)
    const layerPosts = spliceLinkingPost(filler, pivot.linkingPost)
    appendPosts(layerPosts)
    advanceLayer()
    setHotCold(((layerIndex + 1) / bundle.pathChain.length) * 100)
  }

  // Initial layer load once the feed screen mounts with an empty feed.
  useEffect(() => {
    if (status !== 'feed' || !bundle) return
    void ensureLayerLoaded(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, bundle])

  // Track which card is most in-view via IntersectionObserver.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (mostVisible) {
          const id = Number((mostVisible.target as HTMLElement).dataset.postId)
          setCurrentPostId(id)
        }
      },
      { root: container, threshold: [0.6] },
    )

    container.querySelectorAll('[data-post-id]').forEach((card) => observer.observe(card))
    return () => observer.disconnect()
  }, [feedPosts.length, setCurrentPostId])

  // Fetch the next layer once the player nears the end of the loaded feed.
  useEffect(() => {
    if (!bundle || currentPostId === null) return
    const index = feedPosts.findIndex((p) => p.id === currentPostId)
    if (index === -1) return
    const nearEnd = index >= feedPosts.length - NEAR_END_THRESHOLD
    if (nearEnd && currentLayer < bundle.pathChain.length) {
      void ensureLayerLoaded(currentLayer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPostId, feedPosts, currentLayer, bundle])

  // Win check + brainrot decay stub (velocity-aware decay lands in a later pass).
  useEffect(() => {
    if (currentPostId === null || !bundle) return
    const previousPostId = prevPostIdRef.current
    const isFirstObservation = previousPostId === null
    const changed = previousPostId !== currentPostId
    prevPostIdRef.current = currentPostId

    // Checked before the decay branch below so landing on the goal never costs brainrot, and
    // matches the brief: swiping onto the target auto-wins, no like required.
    if (currentPostId === bundle.goal.id) {
      win()
      return
    }

    if (changed && !isFirstObservation) {
      recordSwipe({ postId: currentPostId, direction: 'up', timestampMs: Date.now(), liked: likedPostIds.has(currentPostId) })
      const next = brainrot - BRAINROT_DECAY_PER_SWIPE
      setBrainrot(next)
      if (next <= 0) lose()

      // The post being scrolled away from — if it was never liked, cool its category/tags off.
      const leftPost = feedPosts.find((p) => p.id === previousPostId)
      if (leftPost && !likedPostIds.has(previousPostId)) {
        skipPost(leftPost)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPostId, bundle])

  const currentPost = feedPosts.find((p) => p.id === currentPostId)
  const currentIndex = currentPostId === null ? -1 : feedPosts.findIndex((p) => p.id === currentPostId)

  return (
    <div className="relative h-dvh w-full">
      <div
        ref={containerRef}
        className="h-dvh w-full snap-y snap-mandatory overflow-y-scroll scroll-smooth"
      >
        {feedPosts.map((post, index) => {
          // Only the active card ± RENDER_WINDOW_RADIUS mount real content (and, for the active
          // one, an actual playing <video>) — every other card keeps the same root DOM node (so
          // IntersectionObserver has a stable element to track scroll position through) but skips
          // mounting anything heavy, capping concurrent <video> elements regardless of feed length.
          // currentIndex is -1 until the IntersectionObserver's first callback fires (nothing
          // has been observed yet) — mount everything for that first paint rather than nothing.
          const inWindow = currentIndex === -1 || Math.abs(index - currentIndex) <= RENDER_WINDOW_RADIUS
          return (
            <VideoCard
              key={post.id}
              post={post}
              isActive={post.id === currentPostId}
              mounted={inWindow}
              onLike={() => likePost(post)}
            />
          )
        })}
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute bottom-24 right-4 flex flex-col items-center gap-5">
          {currentPost && (
            <LikeButton
              liked={likedPostIds.has(currentPost.id)}
              count={fakeLikeCount(currentPost.id)}
              onToggle={() => likePost(currentPost)}
            />
          )}
          <HotColdMeter value={hotCold} />
          <BrainrotMeter value={brainrot} />
          <ScrollTimer elapsedSeconds={elapsedSeconds} />
        </div>
      </div>
    </div>
  )
}
