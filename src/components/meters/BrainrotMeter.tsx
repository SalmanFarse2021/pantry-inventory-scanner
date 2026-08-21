import { IconBrain } from '@tabler/icons-react'

export function BrainrotMeter({ value }: { value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-white drop-shadow">
      <div
        className="radial-progress bg-black/30"
        style={{ '--value': value, '--size': '2.75rem' } as React.CSSProperties}
        role="progressbar"
        aria-label="brainrot meter"
        aria-valuenow={Math.round(value)}
      >
        <IconBrain size={20} />
      </div>
      <span className="text-xs font-semibold">{Math.round(value)}%</span>
    </div>
  )
}
