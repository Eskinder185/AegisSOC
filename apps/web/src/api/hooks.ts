import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { RunRow } from './types'

/** Runs a labelled synthetic scenario on the server and refreshes everything derived from the data. */
export function useRunScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, repair, mode }: { id: string; repair?: boolean; mode?: 'instant' | 'paced' }) =>
      api<RunRow>(`/api/lab/scenarios/${id}/run`, { method: 'POST', body: { repair: repair ?? false, mode: mode ?? 'instant' } }),
    onSuccess: () => { void qc.invalidateQueries() },
  })
}

export const DEMO_ORDER = ['credential_attack', 'privilege_service_tamper', 'suspicious_process', 'ids_lateral', 'sensor_silence', 'benign_baseline']
