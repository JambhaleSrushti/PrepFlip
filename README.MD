# Question to MCQ Practice

A student-friendly product that turns questions from a PDF or typed text into an interactive multiple-choice quiz. Students can practise in the original question order or shuffle the questions. It is a website that works on phones and computers.

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

The first version is being built from [`DESIGN.md`](DESIGN.md): a **React** front end, a **Python (FastAPI)** backend, login, and temporary in-memory storage on the server. The original plain-JavaScript prototype is in [`legacy/`](legacy/).

| Milestone | Status |
|---|---|
| M0 Repo skeleton | Done |
| M1 Authentication | Done |
| M2 Text import, review screen, saved sets | Done |
| M3 Practice mode and results (Release 1 candidate) | Done |
| M4 Browser saving, resume and restore | Done |
| M5–M9 | Not started |

## Development

You need [Node.js](https://nodejs.org/) 20+ and [uv](https://docs.astral.sh/uv/) (which installs Python for you).

```
npm run setup      # install front-end and back-end dependencies
```

**Accounts:** there is no sign-up yet (server storage is temporary, so sign-ups would vanish on restart). Accounts live in `backend/users.json`, which git ignores. Create one with:

```
npm run hash-password -- --add asha --name "Asha K"   # asks for the password twice
```

Restart the server after changing accounts. `backend/users.example.json` shows the file format.

**Day-to-day:** run the API and the front end in two terminals, then open http://localhost:5173. The Vite dev server forwards `/api` to the API.

```
npm run dev:api    # FastAPI on http://127.0.0.1:8000 (reloads on change; docs at /api/docs)
npm run dev:web    # React on http://localhost:5173
```

**Production-style run** (one process serves both the built React app and the API, which is what will run on AWS):

```
npm run build      # build the React app into frontend/dist
npm start          # serve it and the API on http://127.0.0.1:8000
```

`npm start` reads `HOST` and `PORT`. It always runs **one worker**: server data lives in memory, so a second worker or instance would have its own separate data.

**Tests:**

```
npm test           # backend (pytest) and front end (Vitest)
npm run test:e2e   # end-to-end (Playwright): builds the app and serves it on port 8123
```

The first time, install the browser for the end-to-end tests with `npx --prefix frontend playwright install chromium`. They log in with a throwaway account in `frontend/e2e/users.json` and use a test-only endpoint that simulates a server restart.

**Where data lives:** the server's memory is the main copy, but it is lost on every restart. The browser keeps a copy of each set the student opens, every unfinished attempt (saved on each answer) and the last 20 results. When the app starts, or the student logs in again after a restart, anything the server is missing is sent back to it.

### Configuration

Environment variables read by the backend:

| Variable | Default | Purpose |
|---|---|---|
| `PREPFLIP_USERS_FILE` | `backend/users.json` | Accounts file |
| `PREPFLIP_STATIC_DIR` | `frontend/dist` | Built React app |
| `PREPFLIP_SECURE_COOKIES` | `false` | Set to `true` behind HTTPS |
| `PREPFLIP_SESSION_TTL_HOURS` | `168` | How long a login lasts |
| `PREPFLIP_TEST_ENDPOINTS` | `false` | Adds `/api/test/restart` for the end-to-end tests. Never set in production. |

### Project layout

```
frontend/   React + TypeScript (Vite)
backend/    FastAPI app
  prepflip/api/        HTTP routers (validation only, no business logic)
  prepflip/services/   business logic
  prepflip/store/      storage interface + in-memory implementation
  prepflip/models.py   stored entities
  tests/               pytest
legacy/     the original prototype
DESIGN.md   the first-version design
```

### Docker

The design uses a Docker image for the AWS pilot. Docker isn't used yet: the npm + uv commands above do the same job locally. The Dockerfile will be added with the deployment milestone (M9).
