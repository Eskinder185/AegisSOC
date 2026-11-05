/** Thin fetch wrapper: same-origin cookies, CSRF header, structured errors with correlation ids. */
export class ApiError extends Error {
  status: number
  code: string
  correlationId?: string
  constructor(status: number, code: string, message: string, correlationId?: string) {
    super(message)
    this.status = status
    this.code = code
    this.correlationId = correlationId
  }
}

function cookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(name + '='))
    ?.split('=')[1]
}

export const UNAUTH_EVENT = 'aegis:unauthenticated'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (opts.body instanceof FormData) body = opts.body
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  if (method !== 'GET') {
    let token = cookie('XSRF-TOKEN')
    if (!token) {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      token = cookie('XSRF-TOKEN')
    }
    if (token) headers['X-XSRF-TOKEN'] = decodeURIComponent(token)
  }
  let res: Response
  try {
    res = await fetch(path, { method, headers, body, credentials: 'same-origin', signal: opts.signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK', 'Cannot reach the AegisSOC API. Check that the backend is running.')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = undefined
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    data = undefined
  }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; correlationId?: string }
    if (res.status === 401 && !path.startsWith('/api/auth/login')) window.dispatchEvent(new Event(UNAUTH_EVENT))
    throw new ApiError(res.status, d.code ?? 'ERROR', d.message ?? `Request failed (${res.status})`, d.correlationId ?? res.headers.get('X-Correlation-Id') ?? undefined)
  }
  return data as T
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Download a file response (reports, exports) through the same auth/CSRF path. */
export async function download(path: string, fallbackName: string): Promise<{ sha256?: string; name: string }> {
  const res = await fetch(path, { credentials: 'same-origin' })
  if (!res.ok) {
    let msg = `Download failed (${res.status})`
    try {
      msg = (await res.json()).message ?? msg
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, 'DOWNLOAD', msg)
  }
  const blob = await res.blob()
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { sha256: res.headers.get('X-Content-SHA256') ?? undefined, name }
}
