import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorState, SeverityBadge, SyntheticBadge } from './ui'
import { ApiError } from '../api/client'

describe('ui primitives', () => {
  it('severity is conveyed by text, not colour alone', () => {
    render(<SeverityBadge severity="HIGH" />)
    expect(screen.getByText('High')).toBeInTheDocument()
  })
  it('synthetic data is always labelled', () => {
    render(<SyntheticBadge />)
    expect(screen.getByText('SYNTHETIC')).toBeInTheDocument()
  })
  it('permission errors are explained and carry a correlation id', () => {
    render(<ErrorState error={new ApiError(403, 'FORBIDDEN', 'Your role does not permit this action', 'abc123')} />)
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission')
    expect(screen.getByText('abc123')).toBeInTheDocument()
    expect(screen.queryByText('Try again')).toBeNull()
  })
  it('network errors offer retry', () => {
    render(<ErrorState error={new ApiError(0, 'NETWORK', 'Cannot reach the AegisSOC API.')} onRetry={() => {}} />)
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })
})
