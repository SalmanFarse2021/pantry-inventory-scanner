import { IconClock } from '@tabler/icons-react'

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ScrollTimer({ elapsedSeconds }: { elapsedSeconds: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-white drop-shadow" role="timer" aria-label="time spent scrolling">
      <IconClock size={32} />
      <span className="text-xs font-semibold">{formatElapsed(elapsedSeconds)}</span>
    </div>
  )
}
