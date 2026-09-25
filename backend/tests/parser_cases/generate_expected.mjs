// Records what the prototype's JavaScript parser (legacy/parser.js) produces for each
// case in cases.json, so the Python parser can be held to the same behaviour.
//
//   node backend/tests/parser_cases/generate_expected.mjs
//
// Re-run it after adding cases. The output is committed, so the tests don't need Node.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
await import(pathToFileURL(join(here, '../../../legacy/parser.js')).href)
const { parse } = globalThis.MCQParser

// The prototype reports issues as sentences; the new app uses codes.
function issueCode(message, q) {
  if (message.startsWith('Question text is empty')) return 'EMPTY_QUESTION'
  if (/^Option [A-Z] is empty/.test(message)) return 'EMPTY_OPTION'
  if (message.startsWith('Needs at least 2')) return 'FEW_OPTIONS'
  if (message.startsWith('Correct answer not found')) return 'MISSING_ANSWER'
  if (message.startsWith("Some symbols couldn't be read")) return 'UNREADABLE_CHARS'
  if (message.startsWith("Correct answer points to an option that doesn't exist")) {
    // Past the last option: the new app drops the answer, so it's simply missing.
    // Pointing at an empty option is already covered by EMPTY_OPTION.
    return q.answer >= q.options.length ? 'MISSING_ANSWER' : null
  }
  throw new Error(`Unmapped prototype issue: ${message}`)
}

const cases = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'))
const expected = {}
for (const [name, text] of Object.entries(cases)) {
  expected[name] = parse(text).map((q) => ({
    text: q.question,
    options: q.options,
    answer_index: q.answer !== null && q.answer < q.options.length ? q.answer : null,
    codes: [...new Set(q.issues.map((m) => issueCode(m, q)).filter(Boolean))].sort(),
    notes: q.notes.length,
  }))
}
writeFileSync(join(here, 'expected_from_js.json'), JSON.stringify(expected, null, 2) + '\n')
console.log(`Wrote expected results for ${Object.keys(expected).length} cases.`)
