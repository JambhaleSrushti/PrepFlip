// Thin wrapper around fetch for the JSON API. The session lives in an HttpOnly cookie,
// so the browser sends it automatically and scripts never see it.

import type { AnswerKeyResult, QuestionSet, SetSummary } from './types'

export type User = {
  id: string
  username: string
  display_name: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Called when a request fails with 401 because the session has ended (expired, logged out
// elsewhere, server restarted). The auth provider uses it to send the student to the login page.
let onSessionEnded: () => void = () => {}

export function setSessionEndedHandler(handler: () => void) {
  onSessionEnded = handler
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }

  if (!res.ok) {
    const detail = await res
      .json()
      .then((data) => (typeof data?.detail === 'string' ? data.detail : null))
      .catch(() => null)
    if (res.status === 401 && !path.startsWith('/auth/')) onSessionEnded()
    throw new ApiError(res.status, detail ?? `Something went wrong (error ${res.status}).`)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const api = {
  login: (username: string, password: string) => request<User>('POST', '/auth/login', { username, password }),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<User>('GET', '/auth/me'),

  importText: (body: { text: string; answer_key?: string; title?: string }) =>
    request<QuestionSet>('POST', '/imports/text', body),
  listSets: () => request<SetSummary[]>('GET', '/sets'),
  getSet: (id: string) => request<QuestionSet>('GET', `/sets/${id}`),
  saveSet: (set: Pick<QuestionSet, 'id' | 'title' | 'questions' | 'source'>) =>
    request<QuestionSet>('PUT', `/sets/${set.id}`, {
      title: set.title.trim() || 'Untitled set',
      source: set.source,
      // Issues are worked out by the server; don't send stale ones back.
      questions: set.questions.map((q) => ({ ...q, issues: [] })),
    }),
  deleteSet: (id: string) => request<void>('DELETE', `/sets/${id}`),
  applyAnswerKey: (id: string, text: string) => request<AnswerKeyResult>('POST', `/sets/${id}/answer-key`, { text }),
}
