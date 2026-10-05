import { useEffect, useRef, useState } from 'react'
import { IconCamera, IconPhoto } from '@tabler/icons-react'

type Props = { onPhoto: (photo: Blob) => void }

// Live rear-camera view with a framing guide. Falls back to the phone's own camera / photo
// picker when live access is denied or unavailable (also handy on a desktop).
export function CameraView({ onPhoto }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let stream: MediaStream | undefined
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch(() => setDenied(true))
    if (!navigator.mediaDevices) setDenied(true)
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function snap() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0)
    canvas.toBlob((b) => b && onPhoto(b), 'image/jpeg', 0.92)
  }

  const picker = (
    <label className="btn btn-outline btn-block">
      <IconPhoto size={20} /> {denied ? 'Take or choose a photo' : 'Choose a photo instead'}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPhoto(f)
          e.target.value = ''
        }}
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-3">
      {!denied && (
        <div className="relative aspect-[3/4] overflow-hidden rounded-box bg-black">
          <video ref={video} autoPlay playsInline muted onPlaying={() => setReady(true)} className="size-full object-cover" />
          {/* Framing guide: the item should fill this box. */}
          <div className="pointer-events-none absolute inset-[12%] rounded-box border-2 border-dashed border-white/80" />
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-white/90">
            One item, label facing the camera
          </p>
        </div>
      )}
      {denied && <p className="text-sm opacity-70">Camera access is off. Use the button below to take a photo.</p>}
      {!denied && (
        <button className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={snap}>
          <IconCamera size={24} /> Capture
        </button>
      )}
      {picker}
    </div>
  )
}
