import { Link } from '@tanstack/react-router'
import { IconCamera, IconListDetails, IconLogout, IconMenu2, IconUser } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'
import { displayNameOf, useSession } from './useSession'

const INFO_URL = 'https://www.uta.edu/student-affairs/health-and-wellness/maverick-pantry'
const BOOK_URL = 'https://app.pantrysoft.com/login/maverickpantry'

export function Navbar() {
  const session = useSession()

  return (
    <nav className="navbar border-b border-base-300 bg-base-100 px-4">
      <Link to="/" className="flex-1 text-lg font-semibold">Thyme Saver</Link>
      <div className="hidden sm:flex">
        <a href={INFO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm mr-2">
          Info
        </a>
        <a href={BOOK_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm mr-2">
          Book Appointment
        </a>
      </div>
      <div className="dropdown dropdown-end sm:hidden">
        <button tabIndex={0} className="btn btn-ghost btn-sm btn-square mr-1" aria-label="Open menu">
          <IconMenu2 size={20} />
        </button>
        <ul tabIndex={0} className="menu dropdown-content z-10 mt-2 w-48 rounded-box bg-base-100 p-2 shadow">
          <li><a href={INFO_URL} target="_blank" rel="noopener noreferrer">Info</a></li>
          <li><a href={BOOK_URL} target="_blank" rel="noopener noreferrer">Book Appointment</a></li>
          {session === null && <li><Link to="/login">Sign in</Link></li>}
        </ul>
      </div>
      {session === undefined ? null : session ? (
        <div className="dropdown dropdown-end">
          <button tabIndex={0} className="btn btn-ghost btn-sm">
            <IconUser size={18} /> {displayNameOf(session)}
          </button>
          <ul tabIndex={0} className="menu dropdown-content z-10 mt-2 w-44 rounded-box bg-base-100 p-2 shadow">
            <li><Link to="/capture"><IconCamera size={18} /> Scan an item</Link></li>
            <li><Link to="/queue"><IconListDetails size={18} /> My scans</Link></li>
            <li>
              <button onClick={() => void supabase.auth.signOut()}>
                <IconLogout size={18} /> Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : (
        <Link to="/login" className="btn btn-primary btn-sm hidden sm:inline-flex">Sign in</Link>
      )}
    </nav>
  )
}
