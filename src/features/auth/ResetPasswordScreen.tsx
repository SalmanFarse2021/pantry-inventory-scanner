import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { supabase } from '../../lib/supabase'
import { useSession } from './useSession'

// The emailed link signs the user in (recovery session); here they choose a new password.
export function ResetPasswordScreen() {
  const navigate = useNavigate()
  const session = useSession()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else await navigate({ href: '/' })
  }

  if (session === undefined) {
    return <main className="mx-auto max-w-sm p-4"><span className="loading loading-spinner" /></main>
  }

  if (!session) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
        <div role="alert" className="alert alert-warning alert-soft">
          This reset link is invalid or has expired.
        </div>
        <Link to="/login" className="link">Request a new link</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm">New password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy && <span className="loading loading-spinner loading-xs" />}
          Update password
        </button>
      </form>
      {error && <div role="alert" className="alert alert-error alert-soft">{error}</div>}
    </main>
  )
}
