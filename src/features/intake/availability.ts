import type { PublicAvailability } from '../../../shared/catalogView'

export const AVAILABILITY_OPTIONS: { value: PublicAvailability; label: string; cls: string }[] = [
  { value: 'in_stock', label: 'In stock', cls: 'btn-success' },
  { value: 'low', label: 'Low stock', cls: 'btn-warning' },
  { value: 'out', label: 'Out of stock', cls: 'btn-error' },
]

export const availabilityText = (a: PublicAvailability) => AVAILABILITY_OPTIONS.find((o) => o.value === a)!.label
