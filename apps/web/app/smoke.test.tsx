import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('renders without crashing', () => {
    render(<div>ok</div>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
