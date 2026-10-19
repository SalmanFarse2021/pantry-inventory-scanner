import { createFileRoute } from '@tanstack/react-router'
import { ShelfCaptureScreen } from '../features/shelf/ShelfCaptureScreen'

export const Route = createFileRoute('/_auth/shelf/')({ component: ShelfCaptureScreen })
