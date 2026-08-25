'use client'

import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function AuthForms() {
  const { login, register, guest } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password, name || 'Player')
    } catch {
      setError('Authentication failed')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" className="rounded-lg border px-3 py-2" />
        {mode === 'register' && (
          <input aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="display name" className="rounded-lg border px-3 py-2" />
        )}
        <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className="rounded-lg border px-3 py-2" />
        <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-white">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      <button onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))} className="text-sm text-blue-600">
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
      </button>
      <button onClick={guest} className="rounded-lg bg-gray-100 px-3 py-2">
        Continue as guest
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
