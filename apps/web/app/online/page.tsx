'use client'

import { useState } from 'react'
import AuthForms from '../../components/AuthForms'
import { createGame } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'

export default function Lobby() {
  const { user, loading, login, register, guest, logout, getAccessToken } = useAuth()
  const [side, setSide] = useState<'white' | 'black'>('white')
  const [minutes, setMinutes] = useState(10)
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setError(null)
    const token = getAccessToken()
    if (!token) return
    try {
      const game = await createGame(side, minutes, token)
      setLink(`${window.location.origin}/game/${game.id}`)
    } catch {
      setError('Could not create game')
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Play online</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {loading ? 'Checking your session…' : user ? 'Set up a game and share the link.' : 'Sign in or continue as a guest to get started.'}
        </p>

        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : !user ? (
            <AuthForms login={login} register={register} guest={guest} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Playing as <span className="font-medium text-zinc-900 dark:text-zinc-50">{user.displayName}</span>
                {user.isAnonymous ? ' (guest)' : ''}
              </p>
              <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
                Your color
                <select
                  aria-label="Your color"
                  value={side}
                  onChange={(e) => setSide(e.target.value as 'white' | 'black')}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </label>
              <label className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
                Time control
                <select
                  aria-label="Time control"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  {[3, 5, 10].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
              <button onClick={create} className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700">
                Create game
              </button>
              {link && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800">
                  <p className="text-zinc-600 dark:text-zinc-300">Share this link with your opponent:</p>
                  <a href={link} className="break-all text-blue-600 dark:text-blue-400">{link}</a>
                  <div className="mt-2">
                    <a href={link} className="inline-block rounded-lg bg-white px-3 py-1 text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50">Open game</a>
                  </div>
                </div>
              )}
              <button onClick={logout} className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">Log out</button>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
