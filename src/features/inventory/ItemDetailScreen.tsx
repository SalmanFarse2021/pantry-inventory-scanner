import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { CategoriesSchema } from '../../../shared/categories'
import { CategoryPicker } from '../intake/CategoryPicker'
import type { Category } from '../intake/categories'
import { AvailabilityBadge } from './AvailabilityBadge'
import { thumbUrl, useInventoryActions, useItemDetail, type ItemEdit } from './useInventory'

export function ItemDetailScreen({ itemId }: { itemId: string }) {
  const navigate = useNavigate()
  const item = useItemDetail(itemId)
  const { adjust, markOut, save, remove } = useInventoryActions()
  const i = item.data

  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [limit, setLimit] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [amount, setAmount] = useState(1)
  const [seeded, setSeeded] = useState(false)

  // Fill the form once; later refreshes (stock changes) must not overwrite what is being typed.
  useEffect(() => {
    if (!i || seeded) return
    setName(i.name)
    setBrand(i.brand ?? '')
    setLimit(i.limit_per_visit?.toString() ?? '')
    setCategories(i.categories as Category[])
    setSeeded(true)
  }, [i, seeded])

  if (item.isLoading) return <span className="loading loading-spinner mx-auto mt-10 block" />
  if (item.error || !i) return <p className="p-4 text-error">Could not load this item.</p>

  const limitValue = limit.trim() === '' ? null : Number(limit)
  const limitValid = limitValue === null || (Number.isInteger(limitValue) && limitValue > 0)
  const valid = name.trim().length > 0 && limitValid && CategoriesSchema.safeParse(categories).success
  const edit: ItemEdit = { name: name.trim(), brand: brand.trim(), categories, limit_per_visit: limitValue }
  const busy = adjust.isPending || markOut.isPending || save.isPending || remove.isPending
  const failure = adjust.error ?? markOut.error ?? save.error ?? remove.error

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Item</h1>
        <Link to="/staff/inventory" className="btn btn-sm btn-ghost">Back</Link>
      </header>

      <img src={thumbUrl(i.thumbnail_path)} alt="" className="max-h-60 w-full rounded-box bg-base-300 object-contain" />

      <section className="flex flex-col gap-2 rounded-box bg-base-200 p-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">{i.stock} on hand</span>
          <AvailabilityBadge stock={i.stock} />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            className="input input-sm w-20"
            aria-label="Amount"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
          />
          <button className="btn btn-sm" disabled={busy} onClick={() => adjust.mutate({ itemId: itemId, delta: amount })}>Add</button>
          <button className="btn btn-sm" disabled={busy || amount > i.stock} onClick={() => adjust.mutate({ itemId: itemId, delta: -amount })}>Remove</button>
          <button className="btn btn-sm btn-ghost ml-auto" disabled={busy || i.stock <= 0} onClick={() => markOut.mutate(itemId)}>Mark out</button>
        </div>
        <p className="text-xs opacity-70">Every change is saved as an adjustment in the ledger.</p>
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Name</span>
        <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Brand</span>
        <input className="input w-full" value={brand} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Limit per visit <span className="font-normal opacity-70">(blank for none)</span></span>
        <input className={`input w-full ${limitValid ? '' : 'input-error'}`} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </label>
      <CategoryPicker value={categories} onChange={setCategories} />

      {failure && <div role="alert" className="alert alert-error alert-soft">{failure.message}</div>}
      {save.isSuccess && !save.isPending && <div role="status" className="text-sm text-success">Saved.</div>}

      <button className="btn btn-primary" disabled={busy || !valid} onClick={() => save.mutate({ itemId, edit })}>Save changes</button>
      <button
        className="btn btn-outline btn-error"
        disabled={busy}
        onClick={() => {
          if (confirm(`Delete "${i.name}" and its stock history? This cannot be undone.`)) {
            remove.mutate(itemId, { onSuccess: () => void navigate({ to: '/staff/inventory' }) })
          }
        }}
      >
        Delete item
      </button>
    </main>
  )
}
