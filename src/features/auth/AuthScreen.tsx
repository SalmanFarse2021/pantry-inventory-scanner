import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../../lib/supabase'
import { UTA_EMAIL_MESSAGE, isUtaEmail } from '../../../shared/email'

type Mode = 'signin' | 'register'

export function AuthScreen() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (mode === 'register' && !isUtaEmail(email)) {
      setError(UTA_EMAIL_MESSAGE)
      return
    }

    setBusy(true)
    const trimmed = email.trim()
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password })
      if (error) setError(error.message)
      else await navigate({ to: '/' })
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: trimmed,
        password,
        options: { data: { display_name: name.trim() } },
      })
      if (error) setError(error.message)
      else if (data.session) await navigate({ to: '/' })
      else setNotice('Check your email to confirm your account, then sign in.')
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <div role="tablist" className="tabs tabs-box">
        <button role="tab" className={`tab flex-1 ${mode === 'signin' ? 'tab-active' : ''}`} onClick={() => setMode('signin')}>
          Sign in
        </button>
        <button role="tab" className={`tab flex-1 ${mode === 'register' ? 'tab-active' : ''}`} onClick={() => setMode('register')}>
          Register
        </button>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'register' && (
          <label className="flex flex-col gap-1">
            <span className="text-sm">Display name</span>
            <input
              required
              maxLength={40}
              className="input w-full"
              placeholder="Shown next to the items you update"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm">UTA email</span>
          <input
            type="email"
            required
            autoComplete="email"
            className="input w-full"
            placeholder="you@mavs.uta.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy && <span className="loading loading-spinner loading-xs" />}
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {error && <div role="alert" className="alert alert-error alert-soft">{error}</div>}
      {notice && <div role="status" className="alert alert-info alert-soft">{notice}</div>}
    </main>
  )
}
