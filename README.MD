# Question to MCQ Practice

A student-friendly product that turns questions from a PDF or typed text into an interactive multiple-choice quiz. Students can practise in the original question order or shuffle the questions. The product could become an app or a website; that decision is still open.

## Features

- Upload a PDF containing questions.
- Paste or type questions directly.
- Review the MCQs before starting a quiz.
- Keep questions in their original order or shuffle them.
- Practise with a clean, easy-to-use interface inspired by NEET and JEE question formats.

## How it works

1. Upload a PDF or enter questions.
2. Review the questions and answer options.
3. Choose **Original order** or **Shuffle**.
4. Start practising.

If a question cannot be read or converted clearly, the product should ask the user to review it rather than silently guessing.

## Design goals

The interface should look appealing and feel simple to use on both phones and computers. Questions should be easy to read, navigation should be clear, and users should always know where they are in the quiz.

## Project status

This is the initial idea. Requirements may change as the project develops. The technology, final platform, and features such as scoring, timers, explanations, and saved progress have not been decided yet.
## Running the prototype

The prototype is a web page served by a small Node.js server, so it works on phones and computers.

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
