import { createFileRoute } from '@tanstack/react-router'
import { InventoryScreen } from '../features/inventory/InventoryScreen'

export const Route = createFileRoute('/staff/inventory')({ component: InventoryScreen })
