// When the app starts (or the student logs in again), give the server back anything it has lost,
// e.g. after a restart. The create-or-update PUT calls are safe to repeat, so this can run every time.

import { api } from './api'
import { localAttempts, localSets, saveAttemptLocally, saveSetLocally } from './localStore'

export async function restoreLocalWork(userId: string): Promise<void> {
  const sets = localSets(userId)
  const attempts = localAttempts(userId)
  if (sets.length === 0 && attempts.length === 0) return

  const [serverSets, serverAttempts] = await Promise.all([api.listSets(), api.listAttempts()])
  const setIds = new Set(serverSets.map((s) => s.id))
  const attemptIds = new Set(serverAttempts.map((a) => a.id))

  const jobs = [
    ...sets.filter((s) => !setIds.has(s.id)).map(async (s) => saveSetLocally(await api.saveSet(s))),
    // An open attempt is always sent: this device may have answers the server hasn't had yet.
    ...attempts
      .filter((a) => !attemptIds.has(a.id) || a.status === 'in_progress')
      .map(async (a) => saveAttemptLocally(await api.restoreAttempt(a))),
  ]
  const failed = (await Promise.allSettled(jobs)).filter((r) => r.status === 'rejected')
  // Keep going: the local copies stay, and the next start tries again.
  if (failed.length) console.warn(`Couldn't restore ${failed.length} item(s) to the server.`, failed)
}
