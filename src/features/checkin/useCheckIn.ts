import { useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// Records this month's visit and returns when it started. Idempotent inside its 30-minute window.
// The database refuses it when the pantry is closed, too close to closing, or already used this month.
export function useCheckIn() {
  return useMutation({
    mutationFn: async (code: string): Promise<Date> => {
      const { data, error } = await supabase.rpc('check_in', { p_code: code })
      if (error) throw error
      return new Date(data as string)
    },
  })
}
