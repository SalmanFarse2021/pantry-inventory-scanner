import { useEffect } from 'react'
import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { useSession } from '../features/auth/useSession'
import { startQueueSync } from '../features/intake/useCaptureQueue'

// Pages for signed-in users. UI guard only: the real enforcement is row-level security in the database.
export const Route = createFileRoute('/_auth')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/login' })
  },
  component: AuthLayout,
})

function AuthLayout() {
  const session = useSession()
  const navigate = useNavigate()

  // Signing out from the menu must not leave these pages on screen.
  useEffect(() => {
    if (session === null) void navigate({ to: '/login' })
  }, [session, navigate])

  // Upload anything captured earlier and keep retrying while these pages are open.
  useEffect(() => {
    const stop = startQueueSync()
    return () => void stop.then((f) => f())
  }, [])

  return <Outlet />
}
