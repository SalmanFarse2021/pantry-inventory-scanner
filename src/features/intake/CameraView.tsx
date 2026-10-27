import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IconCamera, IconPhoto } from '@tabler/icons-react'

type Props = {
  onPhoto: (photo: Blob) => void
  hint?: string
  guide?: boolean // dashed box showing where one item should sit
}

// Live rear-camera view with a framing guide, plus a photo-library picker. Falls back to the
// phone's own camera when live access is denied or unavailable (also handy on a desktop).
export function CameraView({ onPhoto, hint = 'One item, label facing the camera', guide = true }: Props) {
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

  return (
    <div className="flex flex-col gap-3">
      {!denied && (
        <div className="relative aspect-[3/4] overflow-hidden rounded-box bg-black">
          <video ref={video} autoPlay playsInline muted onPlaying={() => setReady(true)} className="size-full object-cover" />
          {guide && <div className="pointer-events-none absolute inset-[12%] rounded-box border-2 border-dashed border-white/80" />}
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-white/90">{hint}</p>
        </div>
      )}
      {denied && <p className="text-sm opacity-70">Camera access is off. Take a photo or choose one from your library.</p>}
      {!denied && (
        <button className="btn btn-primary btn-lg btn-block" disabled={!ready} onClick={snap}>
          <IconCamera size={24} /> Capture
        </button>
      )}
      {denied && (
        <PhotoPicker onPhoto={onPhoto} capture>
          <IconCamera size={20} /> Take a photo
        </PhotoPicker>
      )}
      <PhotoPicker onPhoto={onPhoto}>
        <IconPhoto size={20} /> {denied ? 'Choose from library' : 'Choose from library instead'}
      </PhotoPicker>
    </div>
  )
}

// File-input button. `capture` jumps straight to the camera on phones; without it the OS
// offers the photo library.
function PhotoPicker({ onPhoto, capture, children }: { onPhoto: (photo: Blob) => void; capture?: boolean; children: ReactNode }) {
  return (
    <label className="btn btn-outline btn-block">
      {children}
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPhoto(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}
