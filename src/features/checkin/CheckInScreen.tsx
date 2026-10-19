import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { PANTRY_TZ, updatesOpenUntil } from '../../../shared/pantryGate'
import { useSession } from '../auth/useSession'
import { useCheckIn } from './useCheckIn'

const timeLabel = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: PANTRY_TZ, hour: 'numeric', minute: '2-digit' })

// Opened by scanning the QR code at the pantry: /checkin?code=...
export function CheckInScreen({ code }: { code: string | undefined }) {
  const session = useSession()
  const { mutate, data: checkedInAt, error, isPending } = useCheckIn()
  const started = useRef(false)

  useEffect(() => {
    if (!session || !code || started.current) return
    started.current = true
    mutate(code)
  }, [session, code, mutate])

  const until = checkedInAt && updatesOpenUntil(checkedInAt, new Date())
  const here = `/checkin?code=${encodeURIComponent(code ?? '')}`

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Pantry check-in</h1>

      {!code && <div role="alert" className="alert alert-error alert-soft">This link has no check-in code. Scan the QR code posted at the pantry.</div>}

      {code && session === null && (
        <>
          <p>Sign in with your UTA account to check in.</p>
          <Link to="/login" search={{ redirect: here }} className="btn btn-primary">Sign in</Link>
        </>
      )}

      {isPending && <span className="loading loading-spinner mx-auto" />}
      {error && <div role="alert" className="alert alert-error alert-soft">{error.message}</div>}

      {checkedInAt && (
        <div role="status" className="alert alert-success alert-soft">
          {until ? `You are checked in. You can update stock until ${timeLabel(until)}.` : 'You are checked in, but updates are no longer open.'}
        </div>
      )}

      {(checkedInAt || error) && <Link to="/" className="btn">{checkedInAt ? 'Update stock' : 'Back to the catalog'}</Link>}
    </main>
  )
}
