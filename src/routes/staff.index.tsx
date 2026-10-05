import { Link, createFileRoute } from '@tanstack/react-router'
import { IconBoxSeam, IconCamera, IconListDetails } from '@tabler/icons-react'

export const Route = createFileRoute('/staff/')({
  component: () => (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold">Pantry staff</h1>
      <Link to="/staff/capture" className="btn btn-primary btn-lg">
        <IconCamera /> Add items
      </Link>
      <Link to="/staff/queue" className="btn btn-outline btn-lg">
        <IconListDetails /> Queue
      </Link>
      <Link to="/staff/inventory" className="btn btn-outline btn-lg">
        <IconBoxSeam /> Inventory
      </Link>
    </main>
  ),
})
