import { Link } from '@tanstack/react-router'
import { IconLogout, IconUser } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { displayNameOf, useSession } from './useSession'

export function Navbar() {
  const session = useSession()

  return (
    <nav className="navbar border-b border-base-300 bg-base-100 px-4">
      <Link to="/" className="flex-1 text-lg font-semibold">Thyme Saver</Link>
      {session === undefined ? null : session ? (
        <div className="dropdown dropdown-end">
          <button tabIndex={0} className="btn btn-ghost btn-sm">
            <IconUser size={18} /> {displayNameOf(session)}
          </button>
          <ul tabIndex={0} className="menu dropdown-content z-10 mt-2 w-44 rounded-box bg-base-100 p-2 shadow">
            <li>
              <button onClick={() => void supabase.auth.signOut()}>
                <IconLogout size={18} /> Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : (
        <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
      )}
    </nav>
  )
}
