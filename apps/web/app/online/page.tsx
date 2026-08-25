'use client'

import { useState } from 'react'
import AuthForms from '../../components/AuthForms'
import { createGame } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'

export default function Lobby() {
  const { user, loading, logout, getAccessToken } = useAuth()
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
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Play online</h1>
      {loading ? <p className="text-gray-500">Loading…</p> : !user ? (
        <AuthForms />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">Playing as {user.displayName}{user.isAnonymous ? ' (guest)' : ''}</p>
          <label className="flex items-center gap-2 text-sm">
            Your color
            <select aria-label="Your color" value={side} onChange={(e) => setSide(e.target.value as 'white' | 'black')} className="rounded-lg bg-gray-100 px-2 py-1">
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Time control
            <select aria-label="Time control" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded-lg bg-gray-100 px-2 py-1">
              {[3, 5, 10].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
          <button onClick={create} className="rounded-lg bg-blue-600 px-3 py-2 text-white">Create game</button>
          {link && (
            <div className="rounded-lg border p-3 text-sm">
              <p>Share this link with your opponent:</p>
              <a href={link} className="break-all text-blue-600">{link}</a>
              <div className="mt-2"><a href={link} className="rounded-lg bg-gray-100 px-3 py-1">Open game</a></div>
            </div>
          )}
          <button onClick={logout} className="text-sm text-gray-500">Log out</button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
