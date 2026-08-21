import { IconHeart, IconHeartFilled } from '@tabler/icons-react'
import { formatCount } from '../../lib/formatCount'

export function LikeButton({
  liked,
  count,
  onToggle,
}: {
  liked: boolean
  count: number
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={liked}
      aria-label={liked ? 'unlike' : 'like'}
      className="flex flex-col items-center gap-1 text-white drop-shadow"
    >
      {liked ? (
        <IconHeartFilled size={32} className="text-error" />
      ) : (
        <IconHeart size={32} />
      )}
      <span className="text-xs font-semibold">{formatCount(count + (liked ? 1 : 0))}</span>
    </button>
  )
}
