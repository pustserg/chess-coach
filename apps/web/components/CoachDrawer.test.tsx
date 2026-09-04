import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachDrawer from './CoachDrawer'

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('CoachDrawer', () => {
  it('runs the evaluation on open and enables the input once ready', async () => {
    const getEvaluation = vi.fn().mockResolvedValue({ scoreCp: 20, scoreMate: null, lines: [['g1f3', 'g8f6']] })
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(getEvaluation).toHaveBeenCalledWith(FEN, 16)
    await waitFor(() => expect(screen.getByLabelText('Ask the coach')).toBeEnabled())
  })

  it('streams a reply into the transcript and sends SAN-converted lines', async () => {
    const getEvaluation = vi.fn().mockResolvedValue({ scoreCp: 20, scoreMate: null, lines: [['g1f3', 'g8f6']] })
    const streamReply = vi.fn().mockImplementation(async (_ctx, _messages, onToken) => {
      onToken('Hel')
      onToken('lo')
    })
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={streamReply}
        onClose={vi.fn()}
      />,
    )
    const input = await screen.findByLabelText('Ask the coach')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.type(input, "What's the plan?")
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Hello')).toBeInTheDocument()
    expect(streamReply).toHaveBeenCalledWith(
      expect.objectContaining({
        fen: FEN,
        targetElo: 2000,
        evaluation: { scoreCp: 20, scoreMate: null, lines: [['Nf3', 'Nf6']] },
      }),
      expect.arrayContaining([{ role: 'user', content: "What's the plan?" }]),
      expect.any(Function),
    )
  })

  it('marks a partial reply as interrupted instead of showing the unavailable banner', async () => {
    const getEvaluation = vi.fn().mockResolvedValue({ scoreCp: 20, scoreMate: null, lines: [] })
    const streamReply = vi.fn().mockImplementation(async (_ctx, _messages, onToken) => {
      onToken('Play ')
      onToken('d4')
      throw new Error('stream died')
    })
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={streamReply}
        onClose={vi.fn()}
      />,
    )
    const input = await screen.findByLabelText('Ask the coach')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.type(input, 'Whats the plan?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Play d4 (response interrupted)')).toBeInTheDocument()
    expect(screen.queryByText('Coach is unavailable')).not.toBeInTheDocument()
  })

  it('shows the unavailable banner when the stream fails before any token', async () => {
    const getEvaluation = vi.fn().mockResolvedValue({ scoreCp: 20, scoreMate: null, lines: [] })
    const streamReply = vi.fn().mockRejectedValue(new Error('stream died'))
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={streamReply}
        onClose={vi.fn()}
      />,
    )
    const input = await screen.findByLabelText('Ask the coach')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.type(input, 'Whats the plan?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Coach is unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/response interrupted/)).not.toBeInTheDocument()
  })

  it('shows an unavailable message when the evaluation fails', async () => {
    const getEvaluation = vi.fn().mockRejectedValue(new Error('boom'))
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByText('Coach is unavailable')).toBeInTheDocument()
  })
})
