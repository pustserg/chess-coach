'use client'

import { useState } from 'react'

export interface AuthFormsProps {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  guest: () => Promise<void>
}

const inputClass =
  'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500'

export default function AuthForms({ login, register, guest }: AuthFormsProps) {
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

  const onGuest = async () => {
    setError(null)
    try {
      await guest()
    } catch {
      setError('Authentication failed')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" className={inputClass} />
        {mode === 'register' && (
          <input aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="display name" className={inputClass} />
        )}
        <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className={inputClass} />
        <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      <button onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))} className="text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
      </button>
      <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <button onClick={onGuest} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
        Continue as guest
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
