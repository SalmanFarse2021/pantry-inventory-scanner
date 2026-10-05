import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/staff/')({
  component: () => <main className="p-4">Staff area: intake comes in Phase 2.</main>,
})
