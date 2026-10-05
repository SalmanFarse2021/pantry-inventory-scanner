import { createFileRoute } from '@tanstack/react-router'
import { ItemDetailScreen } from '../features/inventory/ItemDetailScreen'

export const Route = createFileRoute('/staff/items/$itemId')({
  component: function Item() {
    const { itemId } = Route.useParams()
    return <ItemDetailScreen itemId={itemId} />
  },
})
