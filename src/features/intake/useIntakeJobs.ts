import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export type JobStatus = 'queued' | 'processing' | 'green' | 'yellow' | 'red' | 'waiting_quota'

export type IntakeJob = {
  id: string
  status: JobStatus
  quantity: number
  error: string | null
  model_used: string | null
  created_at: string
  identified: { name: string } | null
  items: { name: string; categories: string[] } | null
}

// Jobs for one batch, kept live through Realtime.
export function useIntakeJobs(batchId: string) {
  const queryClient = useQueryClient()
  const key = ['intake-jobs', batchId]

  useEffect(() => {
    const channel = supabase
      .channel(`intake-jobs-${batchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intake_jobs', filter: `batch_id=eq.${batchId}` },
        () => void queryClient.invalidateQueries({ queryKey: ['intake-jobs', batchId] }),
      )
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [batchId, queryClient])

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<IntakeJob[]> => {
      const { data, error } = await supabase
        .from('intake_jobs')
        .select('id, status, quantity, error, model_used, created_at, identified, items(name, categories)')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as IntakeJob[]
    },
    // Realtime is the main signal; polling covers a dropped socket.
    refetchInterval: 10_000,
  })
}
