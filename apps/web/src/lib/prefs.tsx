import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface Prefs {
  theme: 'light' | 'dark'
  toggleTheme: () => void
  utc: boolean
  toggleUtc: () => void
}

const Ctx = createContext<Prefs | null>(null)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'))
  const [utc, setUtc] = useState<boolean>(() => localStorage.getItem('aegis.utc') === '1')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('aegis.theme', theme)
    } catch {
      /* storage may be unavailable */
    }
  }, [theme])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const toggleUtc = useCallback(
    () =>
      setUtc((u) => {
        try {
          localStorage.setItem('aegis.utc', u ? '0' : '1')
        } catch {
          /* ignore */
        }
        return !u
      }),
    [],
  )
  const value = useMemo(() => ({ theme, toggleTheme, utc, toggleUtc }), [theme, toggleTheme, utc, toggleUtc])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePrefs(): Prefs {
  const c = useContext(Ctx)
  if (!c) throw new Error('PrefsProvider missing')
  return c
}
