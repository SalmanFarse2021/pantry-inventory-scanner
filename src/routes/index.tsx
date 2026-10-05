import { createFileRoute } from '@tanstack/react-router'
import { CatalogScreen } from '../features/student/CatalogScreen'

export const Route = createFileRoute('/')({ component: CatalogScreen })
