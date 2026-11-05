export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

export function titleCase(s: string | undefined | null): string {
  if (!s) return ''
  return s.toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase())
}

/** Plain-language status labels (the raw enum values are jargon for newcomers). */
export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    NEW: 'New', ACKNOWLEDGED: 'Acknowledged', INVESTIGATING: 'Investigating', ESCALATED: 'Escalated to case', SUPPRESSED: 'Suppressed', CLOSED: 'Closed',
    TRIAGE: 'Triage', CONTAINMENT_PROPOSED: 'Containment proposed', CONTAINED: 'Contained (verified)', RECOVERY: 'Recovery', RESOLVED: 'Resolved',
    PENDING: 'Pending review', APPROVED: 'Approved (simulated)', REJECTED: 'Rejected', EXPIRED: 'Expired', ATTESTED: 'Done manually (attested)', VERIFIED: 'Check passed',
  }
  return map[s] ?? titleCase(s)
}

export function classificationLabel(c: string): string {
  const map: Record<string, string> = {
    SUSPICIOUS: 'Suspicious', CONFIRMED_INCIDENT: 'Confirmed incident (analyst)', EXPECTED_TEST_ACTIVITY: 'Expected test activity', INCONCLUSIVE: 'Inconclusive', BENIGN: 'Benign',
  }
  return map[c] ?? titleCase(c)
}

export function relativeTime(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const s = Math.round((now - t) / 1000)
  const abs = Math.abs(s)
  const fmt = (n: number, u: string) => (s >= 0 ? `${n}${u} ago` : `in ${n}${u}`)
  if (abs < 45) return s >= 0 ? 'just now' : 'in a moment'
  if (abs < 3600) return fmt(Math.round(abs / 60), 'm')
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'h')
  if (abs < 86400 * 45) return fmt(Math.round(abs / 86400), 'd')
  return new Date(t).toISOString().slice(0, 10)
}

export function absoluteTime(iso: string | undefined | null, utc: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (utc) return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) + ' ' + (Intl.DateTimeFormat().resolvedOptions().timeZone || '')
}

export function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? 'n/a' : `${n}%`
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}

export const ROLE_RANK: Record<string, number> = { VIEWER: 0, ANALYST: 1, DETECTION_ENGINEER: 2, INCIDENT_LEAD: 2, ADMIN: 3 }

/** Mirrors the server role hierarchy (ADMIN > LEAD/ENGINEER > ANALYST > VIEWER). UI only; the API enforces it. */
export function can(role: string | undefined, need: 'ANALYST' | 'INCIDENT_LEAD' | 'DETECTION_ENGINEER' | 'ADMIN'): boolean {
  if (!role) return false
  if (role === 'ADMIN') return true
  if (need === 'ANALYST') return ['ANALYST', 'INCIDENT_LEAD', 'DETECTION_ENGINEER'].includes(role)
  return role === need
}
