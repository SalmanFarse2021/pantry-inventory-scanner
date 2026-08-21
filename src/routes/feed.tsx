import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useGameStore } from '../game/gameStore'
import { FeedList } from '../components/feed/FeedList'
import { WinOverlay } from '../components/overlays/WinOverlay'
import { LoseOverlay } from '../components/overlays/LoseOverlay'
import { resolveFillerFetcher } from '../lib/fillerSource'

export const Route = createFileRoute('/feed')({
  // Same imperative-store guard as /goal — see the comment there. Deliberately does not also
  // require status === 'feed': win/lose overlays render inside FeedScreen while status flips to
  // 'won'/'lost', and this route should stay mounted through that rather than redirect away.
  beforeLoad: () => {
    if (!useGameStore.getState().bundle) {
      throw redirect({ to: '/' })
    }
  },
  component: FeedScreen,
})

function FeedScreen() {
  const navigate = useNavigate()
  const status = useGameStore((s) => s.status)
  const reset = useGameStore((s) => s.reset)
  const startFeed = useGameStore((s) => s.startFeed)

  const backToStart = () => {
    reset()
    void navigate({ to: '/' })
  }

  const retry = () => {
    startFeed()
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <FeedList fillerFetcher={resolveFillerFetcher()} />
      {status === 'won' && <WinOverlay onReplay={backToStart} />}
      {status === 'lost' && <LoseOverlay onRetry={retry} />}
    </div>
  )
}
