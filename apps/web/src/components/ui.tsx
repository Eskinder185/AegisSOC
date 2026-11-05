import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, X, FlaskConical, RefreshCw, Inbox } from 'lucide-react'
import { absoluteTime, classificationLabel, relativeTime, statusLabel } from '../lib/format'
import { usePrefs } from '../lib/prefs'
import { ApiError } from '../api/client'

/* ------------------------------------------------------------------ badges */
const SEV: Record<string, { cls: string; Icon: typeof Info; label: string }> = {
  CRITICAL: { cls: 'b-critical', Icon: ShieldAlert, label: 'Critical' },
  HIGH: { cls: 'b-high', Icon: AlertTriangle, label: 'High' },
  MEDIUM: { cls: 'b-medium', Icon: AlertCircle, label: 'Medium' },
  LOW: { cls: 'b-low', Icon: Info, label: 'Low' },
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEV[severity] ?? { cls: 'b-info', Icon: Info, label: severity }
  return (
    <span className={`badge ${s.cls}`} title={`Severity: ${s.label}`}>
      <s.Icon size={13} aria-hidden="true" />
      {s.label}
      <span className="sr-only"> severity</span>
    </span>
  )
}

const STATUS_CLASS: Record<string, string> = {
  NEW: 'b-high', ACKNOWLEDGED: 'b-low', INVESTIGATING: 'b-low', ESCALATED: 'b-medium', SUPPRESSED: 'b-info', CLOSED: 'b-ok',
  TRIAGE: 'b-low', CONTAINMENT_PROPOSED: 'b-medium', CONTAINED: 'b-ok', RECOVERY: 'b-low', RESOLVED: 'b-ok',
  PENDING: 'b-medium', APPROVED: 'b-ok', REJECTED: 'b-info', EXPIRED: 'b-info', ATTESTED: 'b-low', VERIFIED: 'b-ok',
  HEALTHY: 'b-ok', STALE: 'b-medium', FAILED: 'b-critical', DEGRADED: 'b-high', NEVER_INGESTED: 'b-info', DISABLED: 'b-info',
  OBSERVED_HEALTHY: 'b-ok', TEMPORARILY_UNAVAILABLE: 'b-medium', NOT_OBSERVED: 'b-info', NEVER_CONFIGURED: 'b-info',
  SUCCEEDED: 'b-ok', PARTIAL: 'b-high', RUNNING: 'b-low', DRAFT: 'b-medium', SUPERSEDED: 'b-info',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? 'b-info'}`}>{label ?? statusLabel(status)}</span>
}

export function ClassBadge({ value }: { value: string }) {
  const cls = value === 'CONFIRMED_INCIDENT' ? 'b-critical' : value === 'SUSPICIOUS' ? 'b-high' : value === 'INCONCLUSIVE' ? 'b-medium' : 'b-info'
  return <span className={`badge ${cls}`}>{classificationLabel(value)}</span>
}

export function SyntheticBadge({ title = 'Synthetic data: generated for demonstration, not real activity' }: { title?: string }) {
  return (
    <span className="badge b-synthetic" title={title}>
      <FlaskConical size={12} aria-hidden="true" />
      SYNTHETIC
    </span>
  )
}

/* ------------------------------------------------------------------ time */
export function Time({ value, className = '' }: { value?: string | null; className?: string }) {
  const { utc } = usePrefs()
  if (!value) return <span className="muted">—</span>
  const abs = absoluteTime(value, utc)
  return (
    <time dateTime={value} title={abs} className={className}>
      {relativeTime(value)}
      <span className="sr-only"> ({abs})</span>
    </time>
  )
}

export function AbsTime({ value }: { value?: string | null }) {
  const { utc } = usePrefs()
  if (!value) return <span className="muted">—</span>
  return <time dateTime={value}>{absoluteTime(value, utc)}</time>
}

/* ------------------------------------------------------------------ layout bits */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="h-page">{title}</h1>
        {subtitle && <p className="muted mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '', pad = true, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={`card ${className}`} aria-labelledby={title && id ? id : undefined}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          {title && <h2 id={id} className="card-title">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, to, tone }: { label: string; value: ReactNode; hint?: ReactNode; to?: string; tone?: 'danger' | 'warn' | 'ok' }) {
  const color = tone === 'danger' ? 'text-[var(--crit-fg)]' : tone === 'warn' ? 'text-[var(--high-fg)]' : tone === 'ok' ? 'text-[var(--ok-fg)]' : ''
  const body = (
    <>
      <div className="card-title">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="muted mt-1 text-sm">{hint}</div>}
    </>
  )
  return to ? (
    <Link to={to} className="card card-pad block no-underline transition hover:border-[var(--accent)]">
      {body}
    </Link>
  ) : (
    <div className="card card-pad">{body}</div>
  )
}

export function Banner({ kind = 'info', children, title }: { kind?: 'info' | 'warn' | 'danger' | 'ok' | 'syn'; children: ReactNode; title?: string }) {
  const Icon = kind === 'danger' ? ShieldAlert : kind === 'warn' ? AlertTriangle : kind === 'ok' ? CheckCircle2 : kind === 'syn' ? FlaskConical : Info
  return (
    <div className={`banner banner-${kind} flex gap-3`} role={kind === 'danger' ? 'alert' : 'note'}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        {title && <strong className="block">{title}</strong>}
        {children}
      </div>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function LoadingRows({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-5">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-[var(--surface-2)] p-3"><Inbox size={24} className="muted" aria-hidden="true" /></div>
      <h3 className="h-section">{title}</h3>
      {children && <p className="muted mt-1 max-w-md">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : new ApiError(0, 'ERROR', error instanceof Error ? error.message : 'Something went wrong')
  const denied = e.status === 403
  return (
    <div className="px-6 py-10 text-center" role="alert">
      <div className="mx-auto mb-3 w-fit rounded-full bg-[var(--crit-bg)] p-3 text-[var(--crit-fg)]"><AlertTriangle size={24} aria-hidden="true" /></div>
      <h3 className="h-section">{denied ? 'You do not have permission' : e.status === 0 ? 'Cannot reach the server' : 'Something went wrong'}</h3>
      <p className="muted mx-auto mt-1 max-w-md">{e.message}</p>
      {e.correlationId && <p className="muted mt-1 text-xs">Reference <span className="mono">{e.correlationId}</span></p>}
      {onRetry && !denied && (
        <button className="btn mt-4" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  )
}

/** Standard async boundary: skeleton while pending (a real operation), error with retry, empty state, then content. */
export function Async<T>({ q, empty, rows, children }: {
  q: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown }
  empty?: (d: T) => ReactNode | null
  rows?: number
  children: (d: T) => ReactNode
}) {
  if (q.isPending) return <LoadingRows rows={rows} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const e = empty?.(q.data as T)
  if (e) return <>{e}</>
  return <>{children(q.data as T)}</>
}

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 className="animate-spin" size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ dialogs */
export function Modal({ open, onClose, title, children, footer, drawer = false, labelledBy }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; drawer?: boolean; labelledBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const lastFocus = useRef<Element | null>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      lastFocus.current = document.activeElement
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event) => { e.preventDefault(); onClose() }
    const onCloseEv = () => { (lastFocus.current as HTMLElement | null)?.focus?.() }
    d.addEventListener('cancel', onCancel)
    d.addEventListener('close', onCloseEv)
    return () => { d.removeEventListener('cancel', onCancel); d.removeEventListener('close', onCloseEv) }
  }, [onClose])
  return (
    <dialog ref={ref} className={`modal ${drawer ? 'drawer' : ''}`} aria-labelledby={labelledBy ?? titleId} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <h2 id={titleId} className="h-section">{title}</h2>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close dialog"><X size={18} aria-hidden="true" /></button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

/* ------------------------------------------------------------------ toasts */
interface Toast { id: number; kind: 'ok' | 'danger' | 'info'; text: string }
const ToastCtx = createContext<{ push: (kind: Toast['kind'], text: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((l) => [...l.slice(-3), { id, kind, text }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'danger' ? 9000 : 5000)
  }, [])
  const value = useMemo(() => ({ push }), [push])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'danger' ? 'alert' : 'status'} className={`banner pointer-events-auto banner-${t.kind === 'danger' ? 'danger' : t.kind === 'ok' ? 'ok' : 'info'} flex items-start justify-between gap-3 shadow-lg`}>
            <span>{t.text}</span>
            <button className="shrink-0 opacity-80 hover:opacity-100" aria-label="Dismiss" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}><X size={16} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('ToastProvider missing')
  return c
}

export function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message + (e.correlationId ? ` (ref ${e.correlationId})` : '') : e instanceof Error ? e.message : 'Unexpected error'
}

/* ------------------------------------------------------------------ forms, tabs, pagination */
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange, label }: { tabs: { id: string; label: ReactNode }[]; value: string; onChange: (id: string) => void; label: string }) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id)
    if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id)
  }
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap border-b border-[var(--line)]" onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={t.id === value} aria-controls={`panel-${t.id}`} tabIndex={t.id === value ? 0 : -1} className="tab" onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Pagination({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  if (total <= size) return <p className="muted px-5 py-3 text-sm">{total} result{total === 1 ? '' : 's'}</p>
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3" aria-label="Pagination">
      <span className="muted text-sm">Page {page + 1} of {pages} · {total} results</span>
      <div className="flex gap-2">
        <button className="btn btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ charts (SVG, with a text alternative) */
export function Bars({ data, label, valueLabel = 'Count', height = 90, color = 'var(--accent)' }: { data: { label: string; value: number }[]; label: string; valueLabel?: string; height?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / Math.max(1, data.length)
  return (
    <figure>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={`${label}. ${data.map((d) => `${d.label}: ${d.value}`).join(', ') || 'no data'}`}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 6)
          return <rect key={i} x={i * w + w * 0.12} y={height - h} width={w * 0.76} height={Math.max(h, d.value ? 2 : 0)} rx="1" fill={color}><title>{`${d.label}: ${d.value}`}</title></rect>
        })}
        <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} stroke="var(--line)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="sr-only">
        <table><caption>{label}</caption><thead><tr><th>Bucket</th><th>{valueLabel}</th></tr></thead><tbody>{data.map((d, i) => <tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody></table>
      </figcaption>
    </figure>
  )
}

/** Compact "count + short label" key used beside charts so meaning never relies on colour. */
export function KeyValue({ rows }: { rows: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map((r, i) => (
        <div key={i} className="contents"><dt className="muted">{r.k}</dt><dd className="font-medium">{r.v}</dd></div>
      ))}
    </dl>
  )
}

export function CopyText({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button className="btn btn-sm btn-ghost" onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}>
      {done ? 'Copied' : label}
    </button>
  )
}
