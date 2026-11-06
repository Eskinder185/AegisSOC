import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/index.css'
import { App } from './App'
import { AuthProvider } from './lib/auth'
import { PrefsProvider } from './lib/prefs'
import { ToastProvider } from './components/ui'
import { ApiError } from './api/client'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
})

// GitHub Pages uses hash routing so deep links work without a server rewrite.
const PublicRouter = import.meta.env.VITE_STATIC_DEMO === 'true' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <PrefsProvider>
        <ToastProvider>
          <PublicRouter>
            <AuthProvider>
              <>
                {import.meta.env.VITE_STATIC_DEMO === 'true' && <div role="status" style={{ padding: '8px 16px', background: '#163047', color: '#fff', textAlign: 'center', fontSize: 13, position: 'relative', zIndex: 100 }}> Public frontend preview using demonstration content. Login and backend-dependent app features are not available on this static site. </div>}
                <App />
              </>
            </AuthProvider>
          </PublicRouter>
        </ToastProvider>
      </PrefsProvider>
    </QueryClientProvider>
  </StrictMode>,
)
