import { availabilityOf, type Availability } from '../../../shared/inventoryView'

const BADGE: Record<Availability, { cls: string; label: string }> = {
  in_stock: { cls: 'badge-success', label: 'In stock' },
  low: { cls: 'badge-warning', label: 'Low' },
  out: { cls: 'badge-error', label: 'Out' },
}

export const availabilityLabel = (a: Availability) => BADGE[a].label

export function AvailabilityBadgeFor({ availability }: { availability: Availability }) {
  const { cls, label } = BADGE[availability]
  return <span className={`badge badge-soft badge-sm ${cls}`}>{label}</span>
}

export function AvailabilityBadge({ stock }: { stock: number }) {
  return <AvailabilityBadgeFor availability={availabilityOf(stock)} />
}
