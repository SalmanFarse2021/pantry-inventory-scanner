import { useEffect, useRef } from 'react'
import type { Post } from '../../../shared/types'
import { useDoubleTap } from '../../hooks/useDoubleTap'
import { placeholderGradient } from '../../lib/placeholderGradient'

interface VideoCardProps {
  post: Post
  isActive: boolean
  onLike: () => void
  /**
   * Whether this card is within the render window (active card ± a small radius). Out-of-window
   * cards still render this same root element — so IntersectionObserver keeps a stable node to
   * track scroll position through — but skip mounting the actual video/placeholder content, so
   * at most a handful of cards ever hold a live <video> element regardless of feed length.
   */
  mounted: boolean
}

export function VideoCard({ post, isActive, onLike, mounted }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDoubleTap = useDoubleTap(onLike)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // The `muted` JSX attribute only sets defaultMuted on an element created outside HTML
    // parsing (which is what React always does) — it does not reliably set the live `.muted`
    // IDL property. Browsers require that property (not just the attribute) to be true before
    // they'll allow autoplay, so without this, play() below rejects silently (caught below) and
    // the card is stuck showing its poster frame.
    video.muted = true
    if (isActive) video.play().catch(() => {})
    else video.pause()
  }, [isActive])

  const hasVideo = Boolean(post.video.medium.url)

  return (
    <div
      data-post-id={post.id}
      onPointerUp={mounted ? onDoubleTap : undefined}
      className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black"
    >
      {mounted &&
        (hasVideo ? (
          <video
            ref={videoRef}
            // Set on every mounted card (active ± RENDER_WINDOW_RADIUS), not just the active one,
            // so the next video is already buffered by the time a swipe reaches it — playback
            // itself is still gated on isActive below, this only warms up the browser's buffer.
            src={post.video.medium.url}
            preload="auto"
            poster={post.video.medium.thumbnail}
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center p-8 text-center"
            style={{ background: placeholderGradient(post.category) }}
          >
            <span className="text-2xl font-semibold text-white/80">{post.category}</span>
          </div>
        ))}

      {mounted && (
        <div className="absolute bottom-6 left-4 right-20 text-white drop-shadow">
          <p className="font-semibold">@{post.attribution.user}</p>
          <p className="text-sm opacity-90">{post.tags.map((t) => `#${t}`).join(' ')}</p>
        </div>
      )}
    </div>
  )
}
