// M4: browser saving, resume and restore.
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const QUESTIONS = [
  { id: 'q1', printed_number: 1, text: 'Which organelle is the powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'], answer_index: 1 },
  { id: 'q2', printed_number: 2, text: 'The SI unit of electric charge is', options: ['Volt', 'Ampere', 'Coulomb', 'Ohm'], answer_index: 2 },
  { id: 'q3', printed_number: 3, text: 'Which of the following is a noble gas?', options: ['Nitrogen', 'Argon', 'Oxygen'], answer_index: 1 },
  { id: 'q4', printed_number: 4, text: 'The chemical formula of water is', options: ['H2O', 'CO2', 'NaCl'], answer_index: 0 },
]

async function logIn(page: Page) {
  await page.getByLabel('Username').fill('e2e')
  await page.getByLabel('Password').fill('e2e-password')
  await page.getByRole('button', { name: 'Log in' }).click()
}

/** Log in, create a ready set, open it (as a student would) and start practising. Returns the quiz URL. */
async function startPractice(page: Page): Promise<string> {
  await page.goto('/')
  await logIn(page)
  await expect(page.getByRole('heading', { name: 'Welcome, E2E Student' })).toBeVisible()

  const setId = randomUUID()
  const res = await page.request.put(`/api/sets/${setId}`, { data: { title: 'Resume mock', questions: QUESTIONS } })
  expect(res.ok()).toBe(true)
  await page.goto(`/sets/${setId}`)
  await page.getByRole('button', { name: 'Start practising' }).click()
  await expect(page.getByText('Question 1 of 4')).toBeVisible()
  return new URL(page.url()).pathname
}

/** Answer Q1 correctly, Q2 wrongly and Q3 correctly. */
async function answerThree(page: Page) {
  for (const [option, next] of [['Mitochondria', 2], ['Volt', 3], ['Argon', 4]] as const) {
    await page.getByRole('button', { name: new RegExp(option) }).click()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText(`Question ${next} of 4`)).toBeVisible()
  }
}

async function expectResumed(page: Page) {
  await expect(page.getByText('3 of 4 answered')).toBeVisible()
  await expect(page.getByText('Question 4 of 4')).toBeVisible()
  const palette = page.getByRole('navigation', { name: 'Questions' })
  await expect(palette.getByRole('button', { name: 'Question 1, correct' })).toBeVisible()
  await expect(palette.getByRole('button', { name: 'Question 2, wrong' })).toBeVisible()
  await expect(palette.getByRole('button', { name: 'Question 3, correct' })).toBeVisible()
}

test.beforeEach(async ({ request }) => {
  // Every test starts from a freshly "restarted" server; each gets its own browser storage.
  expect((await request.post('/api/test/restart')).status()).toBe(204)
})

test('reloading mid-attempt resumes it', async ({ page }) => {
  const quiz = await startPractice(page)
  await answerThree(page)
  await page.reload()
  await expectResumed(page)
  expect(new URL(page.url()).pathname).toBe(quiz)
})

test('after a server restart, the set and the attempt are restored from this device', async ({ page, request }) => {
  const quiz = await startPractice(page)
  await answerThree(page)
  // No waiting for the server sync: the last answers may exist only on this device.
  expect((await request.post('/api/test/restart')).status()).toBe(204)

  await page.reload()
  // Sessions don't survive a restart, so the student logs in again and lands back on the quiz.
  await logIn(page)
  await expectResumed(page)
  expect(new URL(page.url()).pathname).toBe(quiz)

  await page.getByRole('link', { name: 'PrepFlip' }).click()
  await expect(page.getByRole('link', { name: /Resume mock/ }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Continue practising' })).toContainText('3 of 4 answered')

  // Finishing works against the restored copy, and the server scores it.
  await page.goto(quiz)
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Submit' }).click()
  const summary = page.getByLabel('Summary')
  await expect(summary).toContainText('2 correct')
  await expect(summary).toContainText('1 wrong')
  await expect(summary).toContainText('1 skipped')
})

test('with browser storage cleared, the attempt resumes from the server', async ({ page }) => {
  await startPractice(page)
  await answerThree(page)
  await expect(page.getByText('Answers saved', { exact: true })).toBeVisible()

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expectResumed(page)
  expect(await page.evaluate(() => localStorage.length)).toBeGreaterThan(0) // and the local copy is back
})
