import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, UNAUTH_EVENT } from '../api/client'
import type { Me } from '../api/types'
import { can } from './format'

interface AuthState {
  me: Me | null
  loading: boolean
  can: (need: 'ANALYST' | 'INCIDENT_LEAD' | 'DETECTION_ENGINEER' | 'ADMIN') => boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/auth/me'),
    retry: false,
    staleTime: 60_000,
  })
  useEffect(() => {
    const h = () => qc.setQueryData(['me'], null)
    window.addEventListener(UNAUTH_EVENT, h)
    return () => window.removeEventListener(UNAUTH_EVENT, h)
  }, [qc])

  const me = q.data ?? null
  const value: AuthState = {
    me,
    loading: q.isPending,
    can: (need) => can(me?.role, need),
    signOut: async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' })
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
      }
      qc.clear()
      qc.setQueryData(['me'], null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const c = useContext(Ctx)
  if (!c) throw new Error('AuthProvider missing')
  return c
}
