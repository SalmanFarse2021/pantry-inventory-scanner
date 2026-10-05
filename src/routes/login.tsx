import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/login')({ component: Login })

function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sent' | string>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // shouldCreateUser: false so only pre-invited auth users can sign in (no public signup).
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/staff` },
    })
    setStatus(error ? error.message : 'sent')
  }

  return (
    <main className="mx-auto max-w-sm p-4">
      <h1 className="mb-4 text-xl font-semibold">Staff login</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          className="input w-full"
          placeholder="you@uta.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn btn-primary">Send magic link</button>
      </form>
      {status === 'sent' && <p className="mt-3">Check your email for the link.</p>}
      {status !== 'idle' && status !== 'sent' && <p className="mt-3 text-error">{status}</p>}
    </main>
  )
}
