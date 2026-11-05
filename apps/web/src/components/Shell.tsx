import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, Bell, BookOpenCheck, Bot, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Menu, Moon, Radar, ScrollText, Search, Settings, Shield,
  ShieldAlert, Siren, Sun, Swords, Server, Globe2, BarChart3, X,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../lib/auth'
import { usePrefs } from '../lib/prefs'
import { titleCase } from '../lib/format'
import { SyntheticBadge, Time } from './ui'

const NAV: { to: string; label: string; icon: typeof Shield; end?: boolean; group: string }[] = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true, group: 'Work' },
  { to: '/app/alerts', label: 'Alerts', icon: Siren, group: 'Work' },
  { to: '/app/incidents', label: 'Cases', icon: ClipboardList, group: 'Work' },
  { to: '/app/hunt', label: 'Hunt', icon: Search, group: 'Investigate' },
  { to: '/app/assets', label: 'Assets & coverage', icon: Server, group: 'Investigate' },
  { to: '/app/intel', label: 'Threat intel', icon: Globe2, group: 'Investigate' },
  { to: '/app/ai', label: 'AI analyst', icon: Bot, group: 'Investigate' },
  { to: '/app/response', label: 'Response center', icon: Swords, group: 'Act' },
  { to: '/app/detections', label: 'Detections', icon: Radar, group: 'Improve' },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, group: 'Improve' },
  { to: '/app/sources', label: 'Data sources', icon: Activity, group: 'Platform' },
  { to: '/app/lab', label: 'Lab & demos', icon: FlaskConical, group: 'Platform' },
  { to: '/app/settings', label: 'Settings & audit', icon: Settings, group: 'Platform' },
]

interface Overview { dataState: { mode: string; text: string; lastSuccessfulIngest: string } }
interface Notifs { unread: number; items: { id: number; title: string; body: string; link?: string; createdAt: string; readAt?: string }[] }

function DataStatePill() {
  const q = useQuery({ queryKey: ['overview-mini'], queryFn: () => api<Overview>('/api/overview'), refetchInterval: 30_000 })
  const mode = q.data?.dataState.mode
  const map: Record<string, { cls: string; label: string }> = {
    DEMO: { cls: 'b-synthetic', label: 'Demo mode · synthetic data' },
    DISCONNECTED: { cls: 'b-info', label: 'No data ingested' },
    FAILED: { cls: 'b-critical', label: 'Source failed' },
    LOCAL_DATA: { cls: 'b-low', label: 'Local data · no live connectors' },
  }
  const m = mode ? map[mode] : undefined
  if (q.isError) return <span className="badge b-critical">API unreachable</span>
  if (!m) return <span className="badge b-info">Checking…</span>
  return (
    <Link to="/app/sources" className={`badge ${m.cls} no-underline`} title={q.data?.dataState.text}>
      {m.label}
    </Link>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notifs>('/api/notifications'), refetchInterval: 30_000 })
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  const unread = q.data?.unread ?? 0
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost btn-icon relative" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Bell size={19} aria-hidden="true" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--crit-fg)] px-1 text-[11px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden" role="region" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <strong>Notifications</strong>
            <button className="btn btn-sm btn-ghost" disabled={unread === 0} onClick={async () => { await api('/api/notifications/read-all', { method: 'POST' }); void qc.invalidateQueries({ queryKey: ['notifications'] }) }}>Mark all read</button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(q.data?.items ?? []).length === 0 && <li className="muted px-4 py-6 text-center text-sm">Nothing new. In-app only: no email or chat messages are sent.</li>}
            {q.data?.items.map((n) => (
              <li key={n.id} className="border-b border-[var(--line)] last:border-0">
                <button className="block w-full px-4 py-3 text-left hover:bg-[var(--surface-2)]" onClick={async () => {
                  await api(`/api/notifications/${n.id}/read`, { method: 'POST' }); void qc.invalidateQueries({ queryKey: ['notifications'] }); setOpen(false); if (n.link) nav(n.link)
                }}>
                  <span className={`block text-sm ${n.readAt ? 'muted' : 'font-semibold'}`}>{n.title}</span>
                  <span className="muted block text-xs">{n.body} · <Time value={n.createdAt} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function Shell() {
  const { me, signOut } = useAuth()
  const { theme, toggleTheme, utc, toggleUtc } = usePrefs()
  const [drawer, setDrawer] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()
  const main = useRef<HTMLElement>(null)
  useEffect(() => { setDrawer(false); main.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [loc.pathname])
  const groups = Array.from(new Set(NAV.map((n) => n.group)))

  const sidebar = (
    <nav aria-label="Primary" className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      {groups.map((g) => (
        <div key={g}>
          <div className="card-title mb-1.5 px-3">{g}</div>
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === g).map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className="nav-link"><n.icon size={18} aria-hidden="true" />{n.label}</NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="muted mt-auto px-3 pt-4 text-xs">
        <p>AegisSOC 0.1 · local build</p>
        <p>AI assists; people decide.</p>
      </div>
    </nav>
  )

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-3 sm:px-5">
        <button className="btn btn-ghost btn-icon lg:hidden" aria-label="Open navigation menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu size={22} aria-hidden="true" /></button>
        <Link to="/app" className="flex items-center gap-2.5 font-bold no-underline" aria-label="AegisSOC home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]"><Shield size={20} aria-hidden="true" /></span>
          <span className="hidden text-lg sm:inline">AegisSOC</span>
        </Link>
        <div className="ml-2 hidden md:block"><DataStatePill /></div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost btn-sm hidden sm:inline-flex" onClick={toggleUtc} title="Switch between your local time zone and UTC for absolute times" aria-pressed={utc}>
            {utc ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace('_', ' ')}
          </button>
          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
          </button>
          <NotificationBell />
          <div className="ml-1 hidden items-center gap-2 border-l border-[var(--line)] pl-3 sm:flex">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{me?.displayName}</div>
              <div className="muted text-xs">{titleCase(me?.role)}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" aria-label="Sign out" onClick={async () => { await signOut(); nav('/login') }}><LogOut size={19} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[260px_1fr]">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] border-r border-[var(--line)] bg-[var(--surface)] lg:block">{sidebar}</aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
            <div className="relative h-full w-[min(86vw,300px)] bg-[var(--surface)] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                <strong>Menu</strong>
                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={18} aria-hidden="true" /></button>
              </div>
              <div className="px-4 pt-3 md:hidden"><DataStatePill /></div>
              {sidebar}
            </div>
          </div>
        )}
        <main id="main" ref={main} tabIndex={-1} className="min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1280px]"><Outlet /></div>
          <footer className="muted mx-auto mt-12 flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] pt-4 text-xs">
            <span className="inline-flex items-center gap-1"><ScrollText size={13} aria-hidden="true" /> Actions are audited.</span>
            <span className="inline-flex items-center gap-1"><ShieldAlert size={13} aria-hidden="true" /> No real system is ever changed by AegisSOC.</span>
            <span className="inline-flex items-center gap-1"><BookOpenCheck size={13} aria-hidden="true" /> Data labelled <SyntheticBadge title="Generated for demonstration" /> is not real.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
