import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Shield, LogIn } from 'lucide-react'
import { api, ApiError } from '../api/client'
import type { Me } from '../api/types'
import { useAuth } from '../lib/auth'
import { Banner, Field, Spinner } from '../components/ui'

export function Login() {
  const { me } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from ?? '/app'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (me) return <Navigate to={from} replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const who = await api<Me>('/api/auth/login', { method: 'POST', body: { username: username.trim(), password } })
      qc.setQueryData(['me'], who)
      nav(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? err.message : err.status === 0 ? err.message : 'Invalid username or password.') : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hero-bg grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5 font-bold no-underline">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]"><Shield size={22} aria-hidden="true" /></span>
          <span className="text-xl">AegisSOC</span>
        </Link>
        <main className="card card-pad" aria-labelledby="login-title">
          <h1 id="login-title" className="h-page text-center !text-xl">Sign in</h1>
          <p className="muted mt-1 text-center text-sm">Local development instance. Nothing here talks to your network.</p>
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {error && <Banner kind="danger">{error}</Banner>}
            <Field label="Username" htmlFor="username">
              <input id="username" className="input" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn btn-primary w-full" type="submit" disabled={busy || !username || !password}>
              {busy ? <Spinner label="Signing in" /> : <LogIn size={17} aria-hidden="true" />} Sign in
            </button>
          </form>
          <details className="mt-5 text-sm">
            <summary className="muted cursor-pointer font-semibold">First time here?</summary>
            <div className="muted mt-2 space-y-2">
              <p>The development database ships with five demo roles: <span className="mono">admin</span>, <span className="mono">lead</span>, <span className="mono">analyst</span>, <span className="mono">engineer</span> and <span className="mono">viewer</span>.</p>
              <p>There is no built-in password. It is set by <span className="mono">AEGIS_DEV_PASSWORD</span> in your <span className="mono">.env</span> file (created by the setup script) or printed once in the API log on first start.</p>
            </div>
          </details>
        </main>
      </div>
    </div>
  )
}
