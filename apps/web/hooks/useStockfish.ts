'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createEngine } from '../lib/stockfish'
import type { Engine, UciWorker } from '../lib/stockfish'
import type { EngineOptions, Evaluation } from '../lib/types'

const ENGINE_WORKER_URL = '/engine/stockfish-18-lite-single.js'
const READY_TIMEOUT_MS = 20000

export function useStockfish(enabled: boolean): {
  ready: boolean
  error: string | null
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  getEvaluation: (fen: string, depth: number) => Promise<Evaluation>
  newGame: () => void
} {
  const engineRef = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(0)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!enabled) {
      engineRef.current?.terminate()
      engineRef.current = null
      return
    }
    pendingRef.current = 0
    chainRef.current = Promise.resolve()
    const worker = new Worker(ENGINE_WORKER_URL)
    const engine = createEngine(worker as unknown as UciWorker)
    engineRef.current = engine

    let settled = false
    const fail = () => {
      if (settled) return
      settled = true
      setError('Engine unavailable')
    }

    worker.onerror = () => fail()
    engine.ready.then(() => {
      settled = true
      setReady(true)
      setError(null)
    })
    const timeout = setTimeout(fail, READY_TIMEOUT_MS)
    return () => {
      settled = true
      clearTimeout(timeout)
      engine.terminate()
      engineRef.current = null
      setReady(false)
      setError(null)
    }
  }, [enabled])

  const getBestMove = useCallback((fen: string, opts: EngineOptions) => {
    const engine = engineRef.current
    if (error) return Promise.reject(new Error('engine unavailable'))
    if (!engine) return Promise.reject(new Error('engine not initialized'))
    const run = () => engine.getBestMove(fen, opts)
    pendingRef.current += 1
    const result = pendingRef.current === 1
      ? run()
      : chainRef.current.then(run, run)
    chainRef.current = result.then(
      () => { pendingRef.current -= 1 },
      () => { pendingRef.current -= 1 },
    )
    return result
  }, [error])

  const getEvaluation = useCallback((fen: string, depth: number) => {
    const engine = engineRef.current
    if (error) return Promise.reject(new Error('engine unavailable'))
    if (!engine) return Promise.reject(new Error('engine not initialized'))
    return engine.getEvaluation(fen, depth)
  }, [error])

  const newGame = useCallback(() => {
    engineRef.current?.newGame()
  }, [])

  return { ready, error, getBestMove, getEvaluation, newGame }
}
