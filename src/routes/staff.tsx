import { useEffect } from 'react'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
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
  // Upload anything captured earlier and keep retrying while the staff area is open.
  useEffect(() => {
    const stop = startQueueSync()
    return () => void stop.then((f) => f())
  }, [])

  return <Outlet />
}
