import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { InventoryRow } from '../../../shared/inventoryView'

export type ItemDetail = InventoryRow & { size: string | null; subcategory: string | null }

const ITEM_COLUMNS = 'id, name, brand, size, subcategory, categories, thumbnail_path, limit_per_visit, created_at'

export const thumbUrl = (path: string | null) =>
  path ? supabase.storage.from('thumbnails').getPublicUrl(path).data.publicUrl : undefined

// Every item with its current stock (summed from the ledger by the item_stock view).
export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: async (): Promise<InventoryRow[]> => {
      const [items, stock] = await Promise.all([
        supabase.from('items').select(ITEM_COLUMNS).limit(5000),
        supabase.from('item_stock').select('item_id, stock').limit(5000),
      ])
      if (items.error) throw items.error
      if (stock.error) throw stock.error
      const byItem = new Map(stock.data.map((s) => [s.item_id as string, s.stock as number]))
      return items.data.map((i) => ({ ...i, stock: byItem.get(i.id) ?? 0 }))
    },
    refetchInterval: 15_000, // students check items out, so counts move
  })
}

export function useItemDetail(itemId: string) {
  return useQuery({
    queryKey: ['inventory-item', itemId],
    queryFn: async (): Promise<ItemDetail> => {
      const [item, stock] = await Promise.all([
        supabase.from('items').select(ITEM_COLUMNS).eq('id', itemId).single(),
        supabase.from('item_stock').select('stock').eq('item_id', itemId).single(),
      ])
      if (item.error) throw item.error
      if (stock.error) throw stock.error
      return { ...item.data, stock: stock.data.stock }
    },
  })
}

export type ItemEdit = {
  name: string
  brand: string
  categories: string[]
  limit_per_visit: number | null
}

// All stock changes go through database functions that write ledger rows.
export function useInventoryActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory'] })
    void queryClient.invalidateQueries({ queryKey: ['inventory-item'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog'] })
  }

  const adjust = useMutation({
    mutationFn: async ({ itemId, delta }: { itemId: string; delta: number }) => {
      const { error } = await supabase.rpc('adjust_stock', { p_item_id: itemId, p_delta: delta })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const markOut = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc('mark_out_of_stock', { p_item_id: itemId })
      if (error) throw error
    },
    onSuccess: refresh,
  })

  const save = useMutation({
    mutationFn: async ({ itemId, edit }: { itemId: string; edit: ItemEdit }) => {
      const { error } = await supabase
        .from('items')
        .update({
          name: edit.name,
          brand: edit.brand || null,
          categories: edit.categories,
          limit_per_visit: edit.limit_per_visit,
        })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: refresh,
  })

  // RLS allows this for the manager, or for the worker who created the item. A blocked delete
  // removes zero rows without an error, so ask for the deleted rows back and check.
  const remove = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.from('items').delete().eq('id', itemId).select('id')
      if (error) throw error
      if (!data.length) throw new Error('Only the manager, or the person who added this item, can delete it.')
    },
    onSuccess: refresh,
  })

  return { adjust, markOut, save, remove }
}
