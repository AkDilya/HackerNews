# AGENTS.md

TrendRadar: a Hacker News tech-trend tracker with three independently run pieces sharing one MongoDB. There is no root manifest, test suite, linter, or CI.

## Services and entrypoints

- `backend/` — FastAPI app; `main.py` is the entrypoint, routes live in `routers/` under `/api/*`, Mongo access in `database.py`.
- `collector/` — standalone async worker. `scheduler.py` is the long-running entrypoint (initial 300 stories, then 50 every 5 minutes); `hn_collector.py` also runs one collection and has a 10-story debug `__main__`.
- `frontend/` — React 18 + Vite SPA. Routing/layout in `src/App.jsx`; each page hardcodes `API_BASE_URL = "http://localhost:8000"`.
- The collector writes to Mongo directly through `backend/database.py` (it appends `../backend` to `sys.path`); it never calls the API. All three share database `trendradar`.
- Data model: `trend_events` has one doc per HN story with unique `id` plus `title, url, score, descendants, created_at, technologies[], sentiment, category`; favorites are keyed by `article_id`, users by `github_id`.

## Run (Windows PowerShell, from repo root)

```powershell
# Backend — must run from backend/ (imports are absolute, e.g. `from database import ...`)
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000

# Collector — must run from collector/ (it relies on cwd-relative dotenv + sys.path)
cd collector
..\.venv\Scripts\python.exe scheduler.py
# One-off collection/debug: ..\.venv\Scripts\python.exe hn_collector.py

# Frontend — Vite must stay on 5173; backend CORS only allows localhost:5173
cd frontend
npm install
npm run dev
```

- Root `.venv` (Python 3.14) already has both backend and collector dependencies. To reinstall: `.venv\Scripts\python.exe -m pip install -r backend\requirements.txt -r collector\requirements.txt`.
- Frontend build check: `npm run build` in `frontend/`. Backend and collector have no build step.

## Prerequisites

- MongoDB at `mongodb://localhost:27017` (db `trendradar`); indexes are created by the backend lifespan on startup.
- Ollama at `http://localhost:11434` with model `qwen2.5:0.5b` while `USE_LLM = True` in `collector/ai_agent.py`. Set it to `False` for the keyword-only fallback, which needs no Ollama.
- GitHub OAuth settings (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`) are in `backend/.env` (gitignored). There is no `collector/.env`; defaults are used.
- Styling is Tailwind via CDN in `frontend/index.html` (`darkMode: 'class'`) — no Tailwind build step, so styling needs network access.

## Gotchas

- Env-name mismatch: code reads `MONGODB_URL` / `DATABASE_NAME`, but both `.env.example` files document `MONGO_URI` / `DB_NAME`. Missing values silently fall back to localhost/`trendradar`; don't assume the example names are read.
- `frontend/package.json` omits two imported packages: `react-router-dom` (`App.jsx`, `AuthCallback.jsx`) and `recharts` (`Dashboard.jsx`). They are absent from `node_modules` too, so `npm install` alone will not make the app build. Add them when touching routing or Dashboard.
- Auth is unfinished: the backend redirects to `{FRONTEND_URL}/auth/callback?token=...`, but `App.jsx` has no `/auth/callback` or `/login` route and `Login.jsx` / `Profile.jsx` / `AuthCallback.jsx` are unrouted. Tokens are kept in `localStorage`; comments about httpOnly cookies are stale.
- Tech taxonomy is duplicated and must be kept in sync by hand: `TECH_SYNONYMS` and keyword map in `collector/ai_agent.py`, `TECH_HIERARCHY` / `CATEGORY_COLORS` in `backend/routers/graph.py`, `ALL_TECHNOLOGIES` in `Explorer.jsx`, and a separate palette in `Graph.jsx`.
- `backend/clean_db.py` hardcodes its Mongo URI and deletes every `trend_events` document. Never run it unless the user asks for a reset.
- `backend/check_db.py` and `check_db_detailed.py` are read-only diagnostics; run them from `backend/`.

## Documentation

- Project docs live in `docs/` as Markdown files; `docs/README.md` is the index. Add new `.md` files there and link them from the index.
- Root `README.md` is the user-facing entry point; update it whenever setup commands, API routes, or known limitations change.

## Existing instruction file

- `CLAUDE.md` holds the owner's Russian project rules, but parts conflict with the code: it asks for TypeScript, while the frontend is `.jsx` and uses native `fetch`, `console.error`, and CDN Tailwind. Match surrounding code; do not mass-convert or refactor to satisfy `CLAUDE.md` unless asked.
