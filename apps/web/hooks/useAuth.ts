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
    const tokens = getTokens()
    if (!tokens) { setLoading(false); return }
    ;(async () => {
      try {
        setUser(await getMe(tokens.access_token))
      } catch {
        try {
          const next = await refresh(tokens.refresh_token)
          setTokens(next.tokens)
          setUser(next.user)
        } catch {
          clearTokens()
        }
      } finally {
        setLoading(false)
      }
    })()
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
