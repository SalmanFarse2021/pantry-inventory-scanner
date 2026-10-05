import { useMemo, useState } from 'react'
import { filterCatalog, type CatalogRow } from '../../../shared/catalogView'
import { CATEGORIES, categoryLabel } from '../intake/categories'
import { AvailabilityBadgeFor } from '../inventory/AvailabilityBadge'
import { thumbUrl } from '../inventory/useInventory'
import { useCatalog } from './useCatalog'

export function CatalogScreen() {
  const { data: rows = [], isLoading, error } = useCatalog()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [hideOut, setHideOut] = useState(false)

  const shown = useMemo(() => filterCatalog(rows, { search, category, hideOut }), [rows, search, category, hideOut])

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <header>
        <h1 className="text-2xl font-semibold">UTA Pantry</h1>
        <p className="text-sm opacity-70">See what is available before you visit.</p>
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

      <ul className="grid grid-cols-2 gap-3">
        {shown.map((r) => <ItemCard key={r.id} item={r} />)}
      </ul>
    </main>
  )
}

function ItemCard({ item }: { item: CatalogRow }) {
  const out = item.availability === 'out'
  return (
    <li className={`card card-sm overflow-hidden bg-base-200 ${out ? 'opacity-60' : ''}`}>
      <figure className="aspect-square bg-base-300">
        {item.thumbnail_path && <img src={thumbUrl(item.thumbnail_path)} alt="" loading="lazy" className="size-full object-cover" />}
      </figure>
      <div className="card-body gap-1">
        <h2 className="line-clamp-2 text-sm font-medium leading-tight">{item.name}</h2>
        <div className="flex flex-wrap items-center gap-1">
          <AvailabilityBadgeFor availability={item.availability} />
          {item.limit_per_visit && <span className="badge badge-soft badge-sm">Limit {item.limit_per_visit}</span>}
        </div>
      </div>
    </li>
  )
}
