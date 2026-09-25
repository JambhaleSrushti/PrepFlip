# PrepFlip prototype (legacy)

The first plain-JavaScript prototype, kept for reference while the React + Python app in `frontend/` and `backend/` catches up (see `DESIGN.md`). It will be deleted once the new app does everything it did.

## Running it

From this `legacy/` folder:

1. `npm install`
2. Optional, for AI PDF conversion: copy `.env.example` to `.env` and add an `ANTHROPIC_API_KEY`.
3. `npm start`, then open http://localhost:5173.

### How PDFs are converted

- **With an API key:** the PDF is sent to Claude, which reads the pages visually. It keeps only the questions (no headers, page numbers or instructions) and writes maths and chemistry notation as LaTeX, which the page renders with KaTeX. It only fills in an answer when the paper gives one, and flags questions that depend on diagrams or that it could not read clearly. This works on scanned PDFs too.
- **Without a key:** text is pulled out in the browser with [pdf.js](https://mozilla.github.io/pdf.js/) into the text box, where you remove anything that is not a question. Symbols that cannot be decoded are flagged for review instead of being shown wrongly. Scanned PDFs are not supported this way.

Both need an internet connection (the page loads pdf.js and KaTeX from a CDN).

### Input format the parser understands

```
1. Question text (can continue on the next line)
(A) option      or  A) option  or  (1) option  or  all on one line: (A) x (B) y
(B) option
Answer: B       (also "Ans:", "Correct answer:", "Key:")
```

Questions that are missing an answer, have fewer than two options or have empty options are flagged in the review step. You cannot start the quiz until they are fixed or removed.

### Files

- `index.html` – the screens (input → review → quiz → result)
- `parser.js` – turns text into MCQs and flags anything unclear
- `app.js` – UI logic
- `styles.css` – mobile-first styling with light and dark themes
- `server.js` – serves the page and the `/api/extract` endpoint that sends PDFs to Claude
