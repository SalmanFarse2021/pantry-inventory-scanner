import { createFileRoute } from '@tanstack/react-router'
import { QueueScreen } from '../features/intake/QueueScreen'

export const Route = createFileRoute('/staff/queue')({ component: QueueScreen })
