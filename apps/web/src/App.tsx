import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Shell } from './components/Shell'
import { LoadingRows } from './components/ui'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Overview } from './pages/Overview'
import { NotFound } from './pages/NotFound'

// Heavier pages are split out so first paint stays light.
const Alerts = lazy(() => import('./pages/Alerts').then((m) => ({ default: m.Alerts })))
const AlertDetail = lazy(() => import('./pages/AlertDetail').then((m) => ({ default: m.AlertDetail })))
const Incidents = lazy(() => import('./pages/Incidents').then((m) => ({ default: m.Incidents })))
const IncidentDetail = lazy(() => import('./pages/IncidentDetail').then((m) => ({ default: m.IncidentDetail })))
const Hunt = lazy(() => import('./pages/Hunt').then((m) => ({ default: m.Hunt })))
const Assets = lazy(() => import('./pages/Assets').then((m) => ({ default: m.Assets })))
const Detections = lazy(() => import('./pages/Detections').then((m) => ({ default: m.Detections })))
const RuleDetail = lazy(() => import('./pages/RuleDetail').then((m) => ({ default: m.RuleDetail })))
const Intel = lazy(() => import('./pages/Intel').then((m) => ({ default: m.Intel })))
const Response = lazy(() => import('./pages/Response').then((m) => ({ default: m.Response })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const Sources = lazy(() => import('./pages/Sources').then((m) => ({ default: m.Sources })))
const Lab = lazy(() => import('./pages/Lab').then((m) => ({ default: m.Lab })))
const AiAnalyst = lazy(() => import('./pages/AiAnalyst').then((m) => ({ default: m.AiAnalyst })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))

function Protected() {
  const { me, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="p-10"><LoadingRows label="Checking your session" rows={3} /></div>
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <Shell />
}

export function App() {
  return (
    <Suspense fallback={<div className="p-10"><LoadingRows label="Loading page" rows={4} /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<Protected />}>
          <Route index element={<Overview />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="alerts/:id" element={<AlertDetail />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="hunt" element={<Hunt />} />
          <Route path="assets" element={<Assets />} />
          <Route path="detections" element={<Detections />} />
          <Route path="detections/:id" element={<RuleDetail />} />
          <Route path="intel" element={<Intel />} />
          <Route path="response" element={<Response />} />
          <Route path="reports" element={<Reports />} />
          <Route path="sources" element={<Sources />} />
          <Route path="lab" element={<Lab />} />
          <Route path="ai" element={<AiAnalyst />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound standalone />} />
      </Routes>
    </Suspense>
  )
}
