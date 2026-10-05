import { createFileRoute } from '@tanstack/react-router'
import { CaptureScreen } from '../features/intake/CaptureScreen'

export const Route = createFileRoute('/staff/capture')({ component: CaptureScreen })
