import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useRef } from 'react'
import { IconSwipeUp } from '@tabler/icons-react'
import { useGameStore } from '../game/gameStore'
import { VideoCard } from '../components/feed/VideoCard'
import { LikeButton } from '../components/feed/LikeButton'
import { BrainrotMeter } from '../components/meters/BrainrotMeter'
import { HotColdMeter } from '../components/meters/HotColdMeter'
import { ScrollTimer } from '../components/meters/ScrollTimer'
import { fakeLikeCount } from '../lib/fakeLikeCount'

// How far (in px) a drag/touch has to travel upward, or a wheel tick has to register, before
// it counts as the "swipe to start" gesture rather than an incidental tap.
const SWIPE_THRESHOLD_PX = 40
const WHEEL_THRESHOLD_PX = 15

export const Route = createFileRoute('/goal')({
  // beforeLoad runs outside React (before the component mounts), so the store is read
  // imperatively via getState() rather than the useGameStore() hook. This is what stops the
  // player from ever reaching /goal or /feed directly (e.g. a bookmarked URL) without a bundle
  // loaded — the "can't get back to goal preview" one-way flow relies on there being no path
  // back into these routes except through the normal splash -> goal -> feed sequence.
  beforeLoad: () => {
    if (!useGameStore.getState().bundle) {
      throw redirect({ to: '/' })
    }
  },
  component: GoalPreviewScreen,
})

function GoalPreviewScreen() {
  const navigate = useNavigate()
  const bundle = useGameStore((s) => s.bundle)
  const startFeed = useGameStore((s) => s.startFeed)

  // Tracks the pointer's starting Y so a swipe can be measured across pointerdown -> pointerup.
  // Deliberately not React state — it never needs to trigger a re-render.
  const dragStartYRef = useRef<number | null>(null)
  // Guards against the gesture firing twice (e.g. a wheel event landing right after a pointer
  // swipe already triggered navigation).
  const startedRef = useRef(false)

  const goal = bundle?.goal

  if (!bundle || !goal) return null

  // The timer only starts once the feed screen mounts with status 'feed' (see FeedList), so
  // simply not calling startFeed() until a real swipe gesture is exactly what keeps it paused
  // through this whole preview.
  const beginGame = () => {
    if (startedRef.current) return
    startedRef.current = true
    startFeed()
    void navigate({ to: '/feed' })
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStartYRef.current = e.clientY
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const startY = dragStartYRef.current
    dragStartYRef.current = null
    if (startY === null) return
    if (startY - e.clientY > SWIPE_THRESHOLD_PX) beginGame()
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY > WHEEL_THRESHOLD_PX) beginGame()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter') beginGame()
  }

  return (
    <div
      className="relative h-dvh w-full touch-none overflow-hidden bg-black text-white"
      role="button"
      tabIndex={0}
      aria-label="Swipe up to start today's challenge"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      <VideoCard post={goal} isActive mounted onLike={() => {}} />

      <div className="pointer-events-none absolute inset-x-0 top-0 pt-[max(1rem,env(safe-area-inset-top))] text-center">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">today&apos;s target</p>
      </div>

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-none absolute bottom-24 right-4 flex flex-col items-center gap-5 opacity-60">
          <LikeButton liked={false} count={fakeLikeCount(goal.id)} onToggle={() => {}} />
          <HotColdMeter value={0} />
          <BrainrotMeter value={100} />
          <ScrollTimer elapsedSeconds={0} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
        <div className="flex flex-col items-center gap-3">
          <IconSwipeUp size={56} className="animate-swipe-hint" />
          <p className="text-lg font-bold tracking-wide">swipe to start</p>
        </div>
      </div>
    </div>
  )
}
