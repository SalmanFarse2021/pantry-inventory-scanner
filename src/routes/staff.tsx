import { useEffect } from 'react'
import { Link, Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { startQueueSync } from '../features/intake/useCaptureQueue'

// UI guard only. The real enforcement is row-level security in the database.
export const Route = createFileRoute('/staff')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/login' })
  },
  component: StaffLayout,
})

function StaffLayout() {
  const navigate = useNavigate()

  // Upload anything captured earlier and keep retrying while the staff area is open.
  useEffect(() => {
    const stop = startQueueSync()
    return () => void stop.then((f) => f())
  }, [])

  return (
    <>
      <nav className="navbar min-h-0 border-b border-base-300 px-4">
        <Link to="/staff" className="flex-1 font-semibold">UTA Pantry</Link>
        <button
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await supabase.auth.signOut()
            await navigate({ to: '/login' })
          }}
        >
          Sign out
        </button>
      </nav>
      <Outlet />
    </>
  )
}
