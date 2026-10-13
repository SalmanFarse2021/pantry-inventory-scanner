import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Navbar } from '../features/auth/Navbar'

export const Route = createRootRoute({
  component: () => (
    <>
      <Navbar />
      <Outlet />
    </>
  ),
})
