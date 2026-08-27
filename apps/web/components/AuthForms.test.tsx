import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AuthForms from './AuthForms'

describe('AuthForms', () => {
  it('calls the guest prop on click and surfaces its rejection', async () => {
    const guest = vi.fn().mockRejectedValue(new Error('boom'))
    render(<AuthForms login={vi.fn()} register={vi.fn()} guest={guest} />)
    await userEvent.click(screen.getByRole('button', { name: /continue as guest/i }))
    expect(guest).toHaveBeenCalledOnce()
    expect(await screen.findByText(/authentication failed/i)).toBeInTheDocument()
  })
})
