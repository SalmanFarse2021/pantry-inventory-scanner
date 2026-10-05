import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { CatalogRow } from '../../../shared/catalogView'

// The public view: availability only, no counts. Works without login.
export function useCatalog() {
  return useQuery({
    queryKey: ['public-catalog'],
    queryFn: async (): Promise<CatalogRow[]> => {
      const { data, error } = await supabase
        .from('available_items')
        .select('id, name, category, thumbnail_path, availability, limit_per_visit')
        .limit(5000)
      if (error) throw error
      return data as CatalogRow[]
    },
    refetchInterval: 30_000,
  })
}
