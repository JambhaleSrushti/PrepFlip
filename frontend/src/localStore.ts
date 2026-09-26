// Copies of the student's work kept in this browser, so an attempt survives a reload and the
// server can be given its data back after a restart (server storage is temporary in the pilot).
// Everything is keyed by user id. Storage can be full, blocked or cleared at any moment, so every
// access is wrapped in try/catch and losing it only loses the local copy.

import type { Attempt, QuestionSet } from './types'

/** Submitted attempts kept per user, newest first. In-progress attempts are always kept. */
export const MAX_RESULTS = 20

type Kind = 'sets' | 'attempts'

const key = (userId: string, kind: Kind) => `prepflip:v1:${userId}:${kind}`

function read<T>(userId: string, kind: Kind): Record<string, T> {
  try {
    const raw = localStorage.getItem(key(userId, kind))
    const data: unknown = raw ? JSON.parse(raw) : null
    return data && typeof data === 'object' ? (data as Record<string, T>) : {}
  } catch {
    return {}
  }
}

function write<T>(userId: string, kind: Kind, docs: Record<string, T>): void {
  try {
    localStorage.setItem(key(userId, kind), JSON.stringify(docs))
  } catch {
    // Full or unavailable: the server copy is still there while it keeps running.
  }
}

export function saveSetLocally(set: QuestionSet): void {
  write(set.owner_id, 'sets', { ...read(set.owner_id, 'sets'), [set.id]: set })
}

export function removeSetLocally(userId: string, id: string): void {
  const sets = read<QuestionSet>(userId, 'sets')
  delete sets[id]
  write(userId, 'sets', sets)
}

export function localSets(userId: string): QuestionSet[] {
  return Object.values(read<QuestionSet>(userId, 'sets'))
}

export function saveAttemptLocally(attempt: Attempt): void {
  const attempts = { ...read<Attempt>(attempt.owner_id, 'attempts'), [attempt.id]: attempt }
  const submitted = Object.values(attempts)
    .filter((a) => a.status === 'submitted')
    .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))
  for (const old of submitted.slice(MAX_RESULTS)) delete attempts[old.id]
  write(attempt.owner_id, 'attempts', attempts)
}

export function localAttempts(userId: string): Attempt[] {
  return Object.values(read<Attempt>(userId, 'attempts'))
}

export function hasLocalWork(userId: string): boolean {
  return localSets(userId).length > 0 || localAttempts(userId).length > 0
}
