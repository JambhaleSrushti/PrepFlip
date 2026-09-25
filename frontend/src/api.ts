// Thin wrapper around fetch for the JSON API. The session lives in an HttpOnly cookie,
// so the browser sends it automatically and scripts never see it.

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
}
