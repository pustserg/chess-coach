import type { GameSummary, OnlineGameState, OnlinePlayer, OnlineStatus, PlayerColor, ResultReason, Stats } from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const TOKENS_KEY = 'chess-trainer-tokens'

export interface Tokens { access_token: string; refresh_token: string }
export interface AuthUser { id: string; email: string | null; displayName: string; isAnonymous: boolean }
export interface AuthResponseWire { user: { id: string; email: string | null; display_name: string; is_anonymous: boolean }; tokens: Tokens }
export interface GameCreated { id: string }

export function getTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKENS_KEY)
  return raw ? (JSON.parse(raw) as Tokens) : null
}

export function setTokens(t: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(t))
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY)
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<T>
}

function toAuthUser(u: AuthResponseWire['user']): AuthUser {
  return { id: u.id, email: u.email, displayName: u.display_name, isAnonymous: u.is_anonymous }
}

export interface AuthResult { user: AuthUser; tokens: Tokens }

async function authResult(wire: AuthResponseWire): Promise<AuthResult> {
  return { user: toAuthUser(wire.user), tokens: wire.tokens }
}

export async function register(email: string, password: string, displayName: string): Promise<AuthResult> {
  const wire = await apiFetch<AuthResponseWire>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, display_name: displayName }) })
  return authResult(wire)
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const wire = await apiFetch<AuthResponseWire>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  return authResult(wire)
}

export async function anonymous(): Promise<AuthResult> {
  const wire = await apiFetch<AuthResponseWire>('/auth/anonymous', { method: 'POST' })
  return authResult(wire)
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const wire = await apiFetch<AuthResponseWire>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) })
  return authResult(wire)
}

export async function claim(email: string, password: string, accessToken: string): Promise<AuthResult> {
  const wire = await apiFetch<AuthResponseWire>('/auth/claim', { method: 'POST', body: JSON.stringify({ email, password }) }, accessToken)
  return authResult(wire)
}

export async function createGame(side: string, timeControlMinutes: number, accessToken: string): Promise<GameCreated> {
  return apiFetch<GameCreated>('/games', { method: 'POST', body: JSON.stringify({ side, time_control_minutes: timeControlMinutes }) }, accessToken)
}

export async function getGame(id: string): Promise<GameSummary> {
  return apiFetch<GameSummary>(`/games/${id}`)
}

export async function abortGame(id: string, accessToken: string): Promise<void> {
  await apiFetch(`/games/${id}/abort`, { method: 'POST' }, accessToken)
}

export async function getMe(accessToken: string): Promise<AuthUser> {
  const u = await apiFetch<AuthResponseWire['user']>('/me', {}, accessToken)
  return toAuthUser(u)
}

export async function getStats(accessToken: string): Promise<Stats> {
  return apiFetch<Stats>('/me/stats', {}, accessToken)
}

export function wsUrl(gameId: string, token: string): string {
  const base = API_URL.replace(/^http/, 'ws')
  return `${base}/games/${gameId}/ws?token=${token}`
}

interface PlayerWire {
  id: string | null
  display_name: string | null
  connected: boolean
}

interface StateWire {
  status: OnlineStatus
  turn: PlayerColor
  fen: string
  san_history: string[]
  last_move: { from: string; to: string } | null
  check: boolean
  check_square: string | null
  clocks: { w_ms: number; b_ms: number }
  white: PlayerWire
  black: PlayerWire
  you_are: PlayerColor
  captured: { w: string[]; b: string[] }
  result: { result: 'white' | 'black' | 'draw'; reason: string } | null
  draw_offered_by: PlayerColor | null
}

export function parseState(wire: unknown): OnlineGameState {
  const s = wire as StateWire
  const player = (p: PlayerWire): OnlinePlayer => ({
    id: p.id,
    displayName: p.display_name,
    connected: p.connected,
  })
  return {
    status: s.status,
    turn: s.turn,
    fen: s.fen,
    sanHistory: s.san_history ?? [],
    lastMove: s.last_move ?? null,
    check: s.check ?? false,
    checkSquare: s.check_square ?? null,
    clocks: { w_ms: s.clocks.w_ms, b_ms: s.clocks.b_ms },
    white: player(s.white),
    black: player(s.black),
    youAre: s.you_are,
    captured: s.captured ?? { w: [], b: [] },
    result: s.result ? { result: s.result.result, reason: s.result.reason as ResultReason } : null,
    drawOfferedBy: s.draw_offered_by ?? null,
  }
}
