import { createFileRoute } from '@tanstack/react-router'
import { CheckInScreen } from '../features/checkin/CheckInScreen'

export const Route = createFileRoute('/checkin')({
  validateSearch: (search: Record<string, unknown>): { code?: string } => ({
    code: typeof search.code === 'string' ? search.code : undefined,
  }),
  component: CheckIn,
})

function CheckIn() {
  const { code } = Route.useSearch()
  return <CheckInScreen code={code} />
}
