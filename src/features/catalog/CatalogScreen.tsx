import { useMemo, useState } from 'react'
import { filterCatalog, type CatalogRow, type PublicAvailability } from '../../../shared/catalogView'
import { isStale, timeAgo } from '../../../shared/freshness'
import { useSession } from '../auth/useSession'
import { CATEGORIES, categoryLabel } from '../intake/categories'
import { AvailabilityBadgeFor } from './AvailabilityBadge'
import { thumbUrl, useCatalog, useSetStatus } from './useCatalog'

export function CatalogScreen() {
  const { data: rows = [], isLoading, error } = useCatalog()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [hideOut, setHideOut] = useState(false)
  const [editing, setEditing] = useState(false)
  const session = useSession()
  const setStatus = useSetStatus()

  const shown = useMemo(() => filterCatalog(rows, { search, category, hideOut }), [rows, search, category, hideOut])

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">UTA Pantry</h1>
          <p className="text-sm opacity-70">See what is available before you visit.</p>
        </div>
        {session && (
          <button className={`btn btn-sm ${editing ? 'btn-neutral' : 'btn-primary'}`} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Update stock'}
          </button>
        )}
      </header>

      <input
        type="search"
        className="input w-full"
        placeholder="Search items"
        aria-label="Search items"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select className="select w-full" aria-label="Category" value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="checkbox checkbox-sm" checked={hideOut} onChange={(e) => setHideOut(e.target.checked)} />
        Hide items that are out of stock
      </label>

      {error && <div role="alert" className="alert alert-error alert-soft">Could not load items. Check your connection and try again.</div>}
      {isLoading && <span className="loading loading-spinner mx-auto" />}
      {!isLoading && !error && !shown.length && <p className="opacity-70">{rows.length ? 'No items match.' : 'No items yet.'}</p>}

      {setStatus.error && <div role="alert" className="alert alert-error alert-soft">{setStatus.error.message}</div>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((r) => (
          <ItemCard
            key={r.id}
            item={r}
            editing={editing && !!session}
            busy={setStatus.isPending && setStatus.variables?.itemId === r.id}
            onSet={(status) => setStatus.mutate({ itemId: r.id, status })}
          />
        ))}
      </ul>
    </main>
  )
}

const STATUSES: { value: PublicAvailability; label: string; cls: string }[] = [
  { value: 'in_stock', label: 'In', cls: 'btn-success' },
  { value: 'low', label: 'Low', cls: 'btn-warning' },
  { value: 'out', label: 'Out', cls: 'btn-error' },
]

type ItemCardProps = {
  item: CatalogRow
  editing: boolean
  busy: boolean
  onSet: (status: PublicAvailability) => void
}

function ItemCard({ item, editing, busy, onSet }: ItemCardProps) {
  const out = item.availability === 'out'
  const stale = isStale(item.updated_at)
  return (
    <li className={`card card-sm overflow-hidden bg-base-200 ${out && !editing ? 'opacity-60' : ''}`}>
      <figure className="aspect-square bg-base-300">
        {item.thumbnail_path && <img src={thumbUrl(item.thumbnail_path)} alt="" loading="lazy" className="size-full object-cover" />}
      </figure>
      <div className="card-body gap-1">
        <h2 className="line-clamp-2 text-sm font-medium leading-tight">{item.name}</h2>
        <AvailabilityBadgeFor availability={item.availability} />
        <p className={`text-xs ${stale ? 'text-warning' : 'opacity-70'}`}>
          {item.updated_at
            ? `Updated ${timeAgo(item.updated_at)}${item.updated_by_name ? ` by ${item.updated_by_name}` : ''}`
            : 'Not yet verified'}
          {stale && item.updated_at && ' · may be out of date'}
        </p>
        {editing && (
          <div className="join mt-1 w-full">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                className={`btn btn-xs join-item flex-1 ${item.availability === s.value ? s.cls : 'btn-soft'}`}
                disabled={busy}
                onClick={() => onSet(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
