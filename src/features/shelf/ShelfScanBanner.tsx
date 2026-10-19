import { Link } from '@tanstack/react-router'
import { requestShelfScan, useOpenShelfScans, type ShelfScan } from './useShelfScans'

const TEXT: Record<ShelfScan['status'], string> = {
  queued: 'Shelf scan waiting to start',
  processing: 'Reading your shelf photo…',
  ready: 'Shelf scan ready: check what we found',
  confirmed: '',
  red: 'Shelf scan failed',
  waiting_quota: 'Shelf scan waiting for the daily limit to reset',
  rejected: 'Shelf photo not accepted',
}

// Open shelf scans for the signed-in student, shown at the top of the catalog.
export function ShelfScanBanner() {
  const { data: scans = [] } = useOpenShelfScans(true)
  if (!scans.length) return null
  return (
    <ul className="flex flex-col gap-2">
      {scans.map((s) => (
        <li key={s.id} className={`alert alert-soft ${s.status === 'ready' ? 'alert-info' : s.status === 'red' || s.status === 'rejected' ? 'alert-error' : ''}`}>
          {(s.status === 'processing' || s.status === 'queued') && <span className="loading loading-spinner loading-sm" />}
          <span className="flex-1">{TEXT[s.status]}</span>
          {(s.status === 'queued' || s.status === 'red') && (
            <button className="btn btn-xs" onClick={() => void requestShelfScan(s.id).catch(() => {})}>Retry</button>
          )}
          <Link to="/shelf/$scanId" params={{ scanId: s.id }} className="btn btn-xs btn-outline">
            {s.status === 'ready' ? 'Check' : 'View'}
          </Link>
        </li>
      ))}
    </ul>
  )
}
