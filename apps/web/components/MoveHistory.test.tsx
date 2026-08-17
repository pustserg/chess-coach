import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MoveHistory from './MoveHistory'

describe('MoveHistory', () => {
  it('renders numbered SAN moves', () => {
    render(<MoveHistory history={['e4', 'e5', 'Nf3']} />)
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument()
    expect(screen.getByText('2. Nf3')).toBeInTheDocument()
  })
})
