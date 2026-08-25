'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getTokens, parseState, wsUrl } from '../lib/api'
import type { OnlineGameState, ResultReason } from '../lib/types'

interface InMessage { type: string; [k: string]: unknown }

export function useOnlineGame(gameId: string) {
  const [state, setState] = useState<OnlineGameState | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const send = useCallback((msg: object) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  const handleMessage = useCallback((e: MessageEvent) => {
    const msg = JSON.parse(e.data) as InMessage
    if (msg.type === 'state') setState(parseState(msg))
    else if (msg.type === 'clock') {
      setState((s) => s ? { ...s, clocks: { w_ms: msg.w_ms as number, b_ms: msg.b_ms as number } } : s)
    } else if (msg.type === 'draw-offered') {
      setState((s) => s ? { ...s, drawOfferedBy: msg.by as 'w' | 'b' } : s)
    } else if (msg.type === 'draw-declined') {
      setState((s) => s ? { ...s, drawOfferedBy: null } : s)
    } else if (msg.type === 'game-over') {
      setState((s) => s ? {
        ...s,
        result: {
          result: msg.result as 'white' | 'black' | 'draw',
          reason: msg.reason as ResultReason,
        },
      } : s)
    }
  }, [])

  useEffect(() => {
    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null
    const connect = () => {
      const token = getTokens()?.access_token
      if (!token || closed) return
      const ws = new WebSocket(wsUrl(gameId, token))
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = handleMessage
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = setTimeout(connect, 1500)
      }
    }
    connect()
    return () => { closed = true; if (retry) clearTimeout(retry); wsRef.current?.close() }
  }, [gameId, handleMessage])

  const sendMove = useCallback((from: string, to: string, promotion?: string) =>
    send({ type: 'move', from, to, promotion }), [send])
  const resign = useCallback(() => send({ type: 'resign' }), [send])
  const offerDraw = useCallback(() => send({ type: 'offer-draw' }), [send])
  const acceptDraw = useCallback(() => send({ type: 'accept-draw' }), [send])
  const declineDraw = useCallback(() => send({ type: 'decline-draw' }), [send])

  return { state, connected, sendMove, resign, offerDraw, acceptDraw, declineDraw }
}
