import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { IconMinus, IconPlus } from '@tabler/icons-react'
import { filterInventory, type Availability, type SortKey } from '../../../shared/inventoryView'
import { CATEGORIES, categoryLabel } from '../intake/categories'
import { AvailabilityBadge, availabilityLabel } from './AvailabilityBadge'
import { thumbUrl, useInventory, useInventoryActions } from './useInventory'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'stock_asc', label: 'Stock, lowest first' },
  { key: 'stock_desc', label: 'Stock, highest first' },
  { key: 'newest', label: 'Newest' },
]
const AVAILABILITIES: Availability[] = ['in_stock', 'low', 'out']

export function InventoryScreen() {
  const { data: rows = [], isLoading, error } = useInventory()
  const { adjust, markOut } = useInventoryActions()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [sort, setSort] = useState<SortKey>('name')

  const shown = useMemo(
    () => filterInventory(rows, { search, category, availability, sort }),
    [rows, search, category, availability, sort],
  )
  const failure = adjust.error ?? markOut.error
  const busy = adjust.isPending || markOut.isPending

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <Link to="/staff/capture" className="btn btn-sm btn-primary">Add items</Link>
      </header>

      <input
        type="search"
        className="input w-full"
        placeholder="Search name, brand or category"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex gap-2">
        <select className="select select-sm min-w-0 flex-1" aria-label="Category" value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <select className="select select-sm min-w-0 flex-1" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2" role="group" aria-label="Availability">
        {AVAILABILITIES.map((a) => (
          <button
            key={a}
            aria-pressed={availability === a}
            className={`btn btn-xs ${availability === a ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setAvailability(availability === a ? null : a)}
          >
            {availabilityLabel(a)}
          </button>
        ))}
      </div>

      {(error || failure) && <div role="alert" className="alert alert-error alert-soft">{(error ?? failure)!.message}</div>}
      {isLoading && <span className="loading loading-spinner mx-auto" />}
      {!isLoading && !shown.length && <p className="opacity-70">{rows.length ? 'No items match.' : 'No items yet.'}</p>}
      {!!rows.length && <p className="text-xs opacity-70">{shown.length} of {rows.length} items</p>}

      <ul className="flex flex-col gap-2">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-box bg-base-200 p-2">
            <img src={thumbUrl(r.thumbnail_path)} alt="" className="size-14 shrink-0 rounded-field bg-base-300 object-cover" />
            <Link to="/staff/items/$itemId" params={{ itemId: r.id }} className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.name}</div>
              <div className="flex items-center gap-2 text-sm opacity-80">
                <span>{r.stock} on hand</span>
                <AvailabilityBadge stock={r.stock} />
              </div>
              <div className="truncate text-xs opacity-60">{r.categories.map(categoryLabel).join(', ')}</div>
            </Link>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="join">
                <button className="btn btn-xs join-item" aria-label={`Remove one ${r.name}`} disabled={busy || r.stock <= 0} onClick={() => adjust.mutate({ itemId: r.id, delta: -1 })}>
                  <IconMinus size={14} />
                </button>
                <button className="btn btn-xs join-item" aria-label={`Add one ${r.name}`} disabled={busy} onClick={() => adjust.mutate({ itemId: r.id, delta: 1 })}>
                  <IconPlus size={14} />
                </button>
              </div>
              <button className="btn btn-xs btn-ghost" disabled={busy || r.stock <= 0} onClick={() => markOut.mutate(r.id)}>
                Mark out
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
