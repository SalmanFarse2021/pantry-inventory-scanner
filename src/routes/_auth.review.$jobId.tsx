import { createFileRoute } from '@tanstack/react-router'
import { ReviewScreen } from '../features/intake/ReviewScreen'

export const Route = createFileRoute('/_auth/review/$jobId')({
  component: function Review() {
    const { jobId } = Route.useParams()
    return <ReviewScreen jobId={jobId} />
  },
})
