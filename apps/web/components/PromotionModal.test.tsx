import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PromotionModal from './PromotionModal'

describe('PromotionModal', () => {
  it('offers all four pieces and reports the choice', async () => {
    const onSelect = vi.fn()
    render(<PromotionModal onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /knight/i }))
    expect(onSelect).toHaveBeenCalledWith('n')
  })
})
