import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { IconMinus, IconPlus, IconRepeat } from '@tabler/icons-react'
import { CameraView } from './CameraView'
import { makeCapture } from './image'
import { useCaptureQueue } from './useCaptureQueue'

type Review = { photo: Blob; thumb: Blob; url: string }

export function CaptureScreen() {
  const { enqueue, last, pending } = useCaptureQueue()
  const [review, setReview] = useState<Review | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(0)

  useEffect(() => () => void (review && URL.revokeObjectURL(review.url)), [review])

  async function onPhoto(source: Blob) {
    setError(null)
    try {
      const { photo, thumb } = await makeCapture(source)
      setReview({ photo, thumb, url: URL.createObjectURL(photo) })
      setQuantity(1)
    } catch {
      setError('Could not read that photo. Try again.')
    }
  }

  function sameAsLast() {
    if (!last) return
    setReview({ photo: last.photo, thumb: last.thumb, url: URL.createObjectURL(last.photo) })
    setQuantity(1)
  }

  async function confirm() {
    if (!review) return
    setBusy(true)
    await enqueue(review.photo, review.thumb, quantity)
    setAdded((n) => n + 1)
    setReview(null)
    setBusy(false)
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Add items</h1>
        <Link to="/staff/queue" className="btn btn-sm btn-ghost">
          Queue{added > 0 && <span className="badge badge-primary">{added}</span>}
          {pending.length > 0 && <span className="badge badge-warning">{pending.length} uploading</span>}
        </Link>
      </header>

      {error && <div role="alert" className="alert alert-error alert-soft">{error}</div>}

      {review ? (
        <>
          <img src={review.url} alt="Captured item" className="aspect-[3/4] w-full rounded-box bg-black object-contain" />
          <div className="flex items-center justify-center gap-4">
            <button className="btn btn-circle" aria-label="Fewer" disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)}>
              <IconMinus />
            </button>
            <div className="text-center">
              <div className="text-4xl font-semibold tabular-nums">{quantity}</div>
              <div className="text-xs opacity-70">quantity</div>
            </div>
            <button className="btn btn-circle" aria-label="More" onClick={() => setQuantity((q) => q + 1)}>
              <IconPlus />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn btn-outline" disabled={busy} onClick={() => setReview(null)}>Retake</button>
            <button className="btn btn-primary" disabled={busy} onClick={confirm}>Confirm</button>
          </div>
        </>
      ) : (
        <>
          <CameraView onPhoto={onPhoto} />
          {last && (
            <button className="btn btn-ghost btn-block" onClick={sameAsLast}>
              <IconRepeat size={18} /> Same item as last photo
            </button>
          )}
        </>
      )}
    </main>
  )
}
