import { createFileRoute } from '@tanstack/react-router'
import { QueueScreen } from '../features/intake/QueueScreen'

export const Route = createFileRoute('/_auth/queue')({ component: QueueScreen })
