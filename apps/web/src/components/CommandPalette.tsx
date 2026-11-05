import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CornerDownLeft, Search } from 'lucide-react'
import { api, qs } from '../api/client'
import type { AlertRow, IncidentRow, Page } from '../api/types'
import { Modal } from './ui'

export interface Command { id: string; label: string; hint?: string; group: string; run: () => void }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/**
 * Command palette: jumps to pages, runs local actions, and searches real alerts and cases.
 * Every result is a link to a record that exists; nothing is synthesised client-side.
 */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const term = useDebounced(text.trim(), 200)

  useEffect(() => { if (open) { setText(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  const alerts = useQuery({
    queryKey: ['palette-alerts', term], enabled: open && term.length >= 2,
    queryFn: () => api<Page<AlertRow>>('/api/alerts' + qs({ q: term, size: 5 })),
  })
  const cases = useQuery({
    queryKey: ['palette-cases', term], enabled: open && term.length >= 2,
    queryFn: () => api<Page<IncidentRow>>('/api/incidents' + qs({ q: term, size: 5 })),
  })

  const items: Command[] = useMemo(() => {
    const t = text.trim().toLowerCase()
    const local = commands.filter((c) => !t || `${c.label} ${c.group}`.toLowerCase().includes(t))
    const found: Command[] = [
      ...(alerts.data?.items ?? []).map((a) => ({ id: `a${a.id}`, label: a.title, hint: `${a.severity.toLowerCase()} · ${a.host ?? a.username ?? a.ip ?? ''}`, group: 'Alerts', run: () => nav(`/app/alerts/${a.id}`) })),
      ...(cases.data?.items ?? []).map((c) => ({ id: `c${c.id}`, label: `#${c.id} ${c.title}`, hint: c.status.toLowerCase(), group: 'Cases', run: () => nav(`/app/incidents/${c.id}`) })),
    ]
    const hunt: Command[] = t.length >= 2 ? [{ id: 'hunt', label: `Hunt for "${text.trim()}" in stored events`, group: 'Search', run: () => nav(`/app/hunt?q=${encodeURIComponent(text.trim())}`) }] : []
    return [...local, ...found, ...hunt]
  }, [text, commands, alerts.data, cases.data, nav])

  useEffect(() => setActive(0), [text])
  const choose = (c?: Command) => { if (!c) return; onClose(); c.run() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]) }
  }
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, listId])

  const searching = term.length >= 2 && (alerts.isFetching || cases.isFetching)
  const failed = alerts.isError || cases.isError
  let lastGroup = ''
  return (
    <Modal open={open} onClose={onClose} title="Command palette">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input ref={inputRef} className="input pl-9" role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={items.length ? `${listId}-${active}` : undefined}
            aria-label="Search pages, alerts and cases, or type a command" placeholder="Go to a page, find an alert or case…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} autoComplete="off" />
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto">
          {items.map((c, i) => {
            const header = c.group !== lastGroup ? (lastGroup = c.group) : null
            return (
              <li key={c.id} role="presentation">
                {header && <div className="card-title px-3 pb-1 pt-3">{header}</div>}
                <div id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? 'bg-[var(--accent-soft)]' : ''}`}
                  onMouseMove={() => setActive(i)} onClick={() => choose(c)}>
                  <span className="min-w-0 truncate">{c.label}</span>
                  <span className="muted flex shrink-0 items-center gap-2 text-xs">{c.hint}{i === active && <CornerDownLeft size={13} aria-hidden="true" />}</span>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="muted text-xs" role="status" aria-live="polite">
          {failed ? 'Alert and case search is unavailable right now; page commands still work.' : searching ? 'Searching alerts and cases…' : items.length === 0 ? 'No matches.' : `${items.length} result${items.length === 1 ? '' : 's'}`}
        </p>
      </div>
    </Modal>
  )
}

export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: 'Ctrl/⌘ K', what: 'Open the command palette' },
  { keys: '?', what: 'Show this list' },
  { keys: 'g then o / a / c / h / s / d / r', what: 'Go to Overview / Alerts / Cases / Hunt / Data sources / Detections / Reports' },
  { keys: 'j / k', what: 'Alerts list: move down / up' },
  { keys: 'Enter', what: 'Alerts list: open the focused alert' },
  { keys: 'x', what: 'Alerts list: select the focused alert (analysts)' },
  { keys: 'Esc', what: 'Close dialogs and menus' },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" footer={<button className="btn" onClick={onClose}>Close</button>}>
      <table className="table"><caption className="sr-only">Keyboard shortcuts</caption>
        <thead><tr><th scope="col">Keys</th><th scope="col">Action</th></tr></thead>
        <tbody>{SHORTCUTS.map((s) => <tr key={s.keys}><td><span className="kbd">{s.keys}</span></td><td>{s.what}</td></tr>)}</tbody>
      </table>
      <p className="muted mt-3 text-xs">Shortcuts are ignored while you type in a field.</p>
    </Modal>
  )
}
