'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  anonymous as anonApi,
  clearTokens,
  getMe,
  getTokens,
  login as loginApi,
  refresh,
  register as registerApi,
  setTokens,
  type AuthUser,
} from '../lib/api'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const tokens = getTokens()
      await Promise.resolve()
      if (cancelled) return
      if (!tokens) {
        setLoading(false)
        return
      }
      try {
        const me = await getMe(tokens.access_token)
        if (!cancelled) setUser(me)
      } catch {
        try {
          const next = await refresh(tokens.refresh_token)
          if (!cancelled) { setTokens(next.tokens); setUser(next.user) }
        } catch {
          if (!cancelled) clearTokens()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginApi(email, password)
    setTokens(res.tokens)
    setUser(res.user)
  }, [])

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await registerApi(email, password, displayName)
    setTokens(res.tokens)
    setUser(res.user)
  }, [])

  const guest = useCallback(async () => {
    const res = await anonApi()
    setTokens(res.tokens)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    setUser(null)
  }, [])

  const getAccessToken = useCallback(() => getTokens()?.access_token ?? null, [])

  return { user, loading, login, register, guest, logout, getAccessToken }
}
