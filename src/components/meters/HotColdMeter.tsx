import { IconTemperature } from '@tabler/icons-react'

export function HotColdMeter({ value }: { value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 text-white drop-shadow">
      <div
        className="radial-progress bg-black/30"
        style={{
          '--value': value,
          '--size': '2.75rem',
          color: `hsl(${(1 - value / 100) * 220}, 90%, 60%)`,
        } as React.CSSProperties}
        role="progressbar"
        aria-label="hot/cold meter"
        aria-valuenow={Math.round(value)}
      >
        <IconTemperature size={20} />
      </div>
      <span className="text-xs font-semibold">{value >= 60 ? 'hot' : value >= 30 ? 'warm' : 'cold'}</span>
    </div>
  )
}
