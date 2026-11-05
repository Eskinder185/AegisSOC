import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'

export function NotFound({ standalone = false }: { standalone?: boolean }) {
  const body = (
    <EmptyState title="Page not found" action={<Link className="btn btn-primary" to={standalone ? '/' : '/app'}>Go to {standalone ? 'the home page' : 'the overview'}</Link>}>
      That address does not exist in AegisSOC. If you followed a link inside the app, please report it.
    </EmptyState>
  )
  return standalone ? <main className="grid min-h-dvh place-items-center">{body}</main> : body
}
