import { createFileRoute } from '@tanstack/react-router'
import { ShelfReviewScreen } from '../features/shelf/ShelfReviewScreen'

export const Route = createFileRoute('/_auth/shelf/$scanId')({
  component: function ShelfReview() {
    const { scanId } = Route.useParams()
    return <ShelfReviewScreen scanId={scanId} />
  },
})
