import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

// UI guard only. The real enforcement is row-level security in the database.
export const Route = createFileRoute('/staff')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/login' })
  },
  component: Outlet,
})
