'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getTokens, parseState, refresh, setTokens, wsUrl } from '../lib/api'
import type { OnlineGameState, ResultReason } from '../lib/types'

interface InMessage { type: string; [k: string]: unknown }

export function useOnlineGame(gameId: string) {
  const [state, setState] = useState<OnlineGameState | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const stoppedRef = useRef(false)

  const send = useCallback((msg: object) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  const handleUnauthorized = useCallback(async () => {
    const r = getTokens()?.refresh_token
    if (r) {
      try {
        const next = await refresh(r)
        setTokens(next.tokens)
      } catch {
        stoppedRef.current = true
        setError('Your session has expired. Please sign in again.')
        wsRef.current?.close()
        return
      }
    } else {
      stoppedRef.current = true
      setError('Your session has expired. Please sign in again.')
      wsRef.current?.close()
      return
    }
    // Refresh succeeded: close so the reconnect path re-reads the fresh token.
    wsRef.current?.close()
  }, [])

  const handleMessage = useCallback((e: MessageEvent) => {
    const msg = JSON.parse(e.data) as InMessage
    if (msg.type === 'state') {
      setState(parseState(msg))
      setLastError(null)
    } else if (msg.type === 'clock') {
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
    } else if (msg.type === 'move-rejected') {
      setLastError(`Move rejected: ${typeof msg.reason === 'string' ? msg.reason : 'illegal'}`)
    } else if (msg.type === 'error') {
      if (msg.reason === 'unauthorized') {
        void handleUnauthorized()
      } else {
        setLastError(typeof msg.reason === 'string' ? msg.reason : 'Connection error')
      }
    }
  }, [handleUnauthorized])

  useEffect(() => {
    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null
    const connect = () => {
      const token = getTokens()?.access_token
      if (!token || closed || stoppedRef.current) return
      const ws = new WebSocket(wsUrl(gameId, token))
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = handleMessage
      ws.onclose = () => {
        setConnected(false)
        if (!closed && !stoppedRef.current) retry = setTimeout(connect, 1500)
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

  return { state, connected, lastError, error, sendMove, resign, offerDraw, acceptDraw, declineDraw }
}
