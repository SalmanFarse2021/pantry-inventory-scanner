import { useEffect } from 'react'
import confetti from 'canvas-confetti'

export function WinOverlay({ onReplay }: { onReplay: () => void }) {
  useEffect(() => {
    const duration = 2000
    const end = Date.now() + duration
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 } })
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 } })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  }, [])

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 text-center text-white">
      <h2 className="text-4xl font-bold">found it!</h2>
      <p className="opacity-80">you steered the algorithm to today's target.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={onReplay}>
        back to start
      </button>
    </div>
  )
}
