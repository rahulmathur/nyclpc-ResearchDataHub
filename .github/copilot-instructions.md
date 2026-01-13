# Copilot / AI agent instructions for DataFlow (Data Manager)

This file is a compact, actionable guide for an AI coding agent to be productive in this repo.

## Big picture
- Full-stack single-repo app: `frontend/` (React) + `backend/` (Node + Express). Refer to `README.md` for high-level details.
- The backend exposes a small set of REST endpoints for listing tables, CRUD on a table, and a generic SQL `POST /api/query` endpoint. See `backend/server.js` for implementation.
- Frontend components in `frontend/src/components/*` call these endpoints via Axios (proxy configured to `http://localhost:5000` in `frontend/package.json`). Key components: `TableView.js` and `QueryEditor.js`.

## How to run (developer workflow)
- Backend:
  - `cd backend && npm install`
  - Configure `.env` (copy `.env.example`) — required keys: `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
  - Start: `npm start` (production) or `npm run dev` (nodemon)
- Frontend:
  - `cd frontend && npm install`
  - Start: `npm start` (runs on `http://localhost:3000`, proxy to backend)

## Data and API conventions (important for automation)
- `DB_TYPE` drives DB behavior: **PostgreSQL only** (use `postgresql` or `postgres`) — see `backend/server.js`.
- API shapes returned consistently include a `success` boolean and `data` / `count` / `rowCount` where applicable. Example `GET /api/table/users` returns `{ success: true, data: [...], count: 123 }`.
- `POST /api/query` expects `{ query: string, params?: [] }` and returns `{ success: true, data: [...], rowCount }`. This project supports **PostgreSQL** only.
- Frontend expects PostgreSQL parameterization: $1, $2, ...
- Primary key expectations:
  - SQL tables: `id` (most tables follow this, but project/site tables use custom PKs — see below)
  TableView and components account for primary `id` fields (e.g., `row.id`).

**Note on projects/sites tables:** `hub_projects` and `hub_sites` use `hub_project_id` and `hub_site_id` as primary keys respectively. Backend endpoints normalize these records to include an `id` property (e.g., `id: hub_project_id`) so frontend components can rely on `id` uniformly.


## Implementation notes and gotchas (do not ignore)
- Table and column names are interpolated directly into SQL strings in many endpoints (e.g., `SELECT * FROM ${tableName}` in `server.js`). This is a potential injection surface. When adding features or altering endpoints, preserve or improve parameterization and sanitize identifiers.
- Error handling returns HTTP 500 with `{ error: message }`. Frontend surfaces `err.response?.data?.error` in the UI.


## Where to modify / extend
- Add new API routes in `backend/server.js` (small codebase; minimal abstractions). Keep consistent response shapes (`{ success: true, ... }` or `{ error: '...' }`).
- Add/extend UI in `frontend/src/components/`. This project uses Semantic UI React for components and styling; prefer `semantic-ui-react` components (Menu, Table, Form, Card, Message) and keep component-level CSS minimal for project-specific overrides. `TableView.js` is a reference for table CRUD UI, pagination and add/edit patterns.
- Branding: follow existing LPC branding assets located in `frontend/src/assets/` (we added `lpc-logo.svg`) and ensure links point to `https://www.nyc.gov/site/lpc`.  Brand colors in `App.css` are approximations; verify with official assets if needed.
- Favicons / Manifest: `frontend/public/favicon.ico`, `frontend/public/favicon-32.png`, and `frontend/public/site.webmanifest` were added; update these with official icons if you have them.
- Official logo swaps: place approved logos in `frontend/src/assets/` and update `BrandHeader` or `App.js` accordingly; include any required legal attributions or usage notes.
- Accessibility: ensure interactive elements are keyboard-accessible and include ARIA attributes where relevant (e.g., `aria-label`, `role`, `tabIndex`). Use `useRef`/focus management for better keyboard focus when opening panes or dialogs.

## Tests / CI
- No unit or integration tests present. `frontend/package.json` contains `test` (react-scripts) but no tests currently exist. There is no backend test harness. Add tests intentionally where coverage is required.
- A small smoke script is included for quick verification of core endpoints: `cd backend && npm run smoke` (runs `/api/health`, `/api/projects`, and `/api/projects/:id/sites` if a project exists). Note: the script requires `jq` to parse JSON (`brew install jq` on macOS). Run this during QA or before opening a PR that touches backend or DB code.

## Quick examples (use these in PRs/edits)
- Execute query (JS):
  axios.post('/api/query', { query: 'SELECT * FROM users LIMIT 10' })
- Get table page (JS):
  axios.get('/api/table/users', { params: { limit: 50, offset: 0 } })
- Insert (SQL backend): constructs `INSERT` with columns and parameter placeholders (Postgres uses `$1...`)

### New endpoints: Projects and Sites
- Get projects (returns normalized `id`):
  - curl http://localhost:5000/api/projects
  - axios.get('/api/projects').then(res => res.data.data)
- Get sites for a project (by `id` or `hub_project_id`):
  - curl http://localhost:5000/api/projects/123/sites
  - axios.get(`/api/projects/${projectId}/sites`).then(res => res.data.data)

Notes:
- The backend maps `hub_project_id` → `id` and `hub_site_id` → `id` in responses so frontend can use `row.id` consistently.
- SQL queries use parameterized placeholders (`$1` for Postgres) to avoid injection; when adding features that interpolate identifiers (table/column names), sanitize them carefully.

## Security & maintenance notes (explicitly discoverable)
- Do not commit `.env` files. Use `.env.example` as template.
- When changing DB-related code, check both SQL and Mongo code-paths and tests on each DB type.

---
If anything above is unclear or you'd like more examples (payloads, common failing errors, or recommended sanitizers), tell me what to add or change and I will iterate. ✨