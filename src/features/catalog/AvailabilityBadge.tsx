import type { PublicAvailability } from '../../../shared/catalogView'

const BADGE: Record<PublicAvailability, { cls: string; label: string }> = {
  in_stock: { cls: 'badge-success', label: 'In stock' },
  low: { cls: 'badge-warning', label: 'Low' },
  out: { cls: 'badge-error', label: 'Out' },
}

export const availabilityLabel = (a: PublicAvailability) => BADGE[a].label

export function AvailabilityBadgeFor({ availability }: { availability: PublicAvailability }) {
  const { cls, label } = BADGE[availability]
  return <span className={`badge badge-soft badge-sm ${cls}`}>{label}</span>
}
