# AI Workflow Studio

A Manifest V3 browser extension for AI image/video workflow automation: queue-based job management across multiple providers, prompt templates with variable expansion and batch fan-out, automatic downloads, scheduling, notifications, history, local-only analytics, and full settings/import-export.

Built per the engineering specification in [docs/SPECIFICATION.md](docs/SPECIFICATION.md). Architecture decisions, module status, and key design tradeoffs live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — read that first if you're picking this project back up.

## Stack

- Manifest V3 (background service worker + side panel + dynamically registered content scripts)
- React 18 + TypeScript (strict) + Vite + Tailwind CSS 4
- Zustand for UI state; IndexedDB for jobs/templates/downloads/history/scheduled jobs; `chrome.storage.sync` for settings
- Vitest for unit/integration tests, ESLint (typescript-eslint) for linting

## Getting started

```bash
npm install
npm run check     # typecheck + lint + tests + build
```

### Load the extension

1. `npm run build` — outputs the unpacked extension to `dist/`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` directory.
4. Click the toolbar action to open the side panel.

The extension ships with a **mock provider** so every feature can be exercised end to end (queueing, retries, downloads, history, analytics, scheduling, notifications) without any external service or API key.

### Try the golden path

1. **Dashboard** → "Enqueue test job". The mock provider validates, runs, and completes it in a couple of seconds.
2. **Jobs** → watch it move through `pending → validating → running → completed`; click **Download**.
3. **Downloads** → the artifact downloads for real (via `chrome.downloads`) and the task moves to `completed`; the job itself moves to `downloaded`.
4. **History** → the finished job is archived automatically; try the search box and state filter chips.
5. **Analytics** → totals and provider/kind breakdowns update from History.
6. **Prompts** → create a template with a `{{variable}}`, then "Use" it (fills the variable, enqueues) or "Batch" it (comma-separated options per variable, fans out into N jobs).
7. **Dashboard** → "Schedule for later" to queue a job for a future time.
8. **Settings** → theme (try switching to Dark — it overrides your OS setting), concurrency, notifications, and Export/Import data as a JSON file.

Keyboard: `Alt+1`..`Alt+7` switches views; `Escape` closes the Prompt Library's dialogs.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server for rapid side-panel UI work (runs disconnected from the background worker) |
| `npm run build` | Production build: side panel + background worker, then content script (IIFE) |
| `npm run typecheck` | `tsc --noEmit` under strict settings |
| `npm run lint` | ESLint over the repo |
| `npm test` | Vitest run |
| `npm run check` | All of the above plus the build — the pre-commit gate |

## Project layout

```
src/
  analytics/    Local-only usage snapshots derived from History
  app/          Side panel React application (views, zustand store, keyboard shortcuts, theme)
  background/   Service worker entry: wires every module + the message router + chrome.alarms heartbeat
  content/      Content script entry (dynamically registered per provider)
  downloads/    Download manager: driver abstraction, progress, retry
  history/      Archive of finished jobs, searchable
  importExport/ Bundles templates/settings/history to/from a portable JSON file
  notifications/ Job completion/failure browser notifications
  prompts/      Prompt library + {{variable}} expansion
  providers/    Provider abstraction: adapter interface, registry, mock provider
  queue/        Queue engine (state machine, concurrency, retry) + batch engine
  scheduler/    Timed jobs + chrome.alarms-backed durability
  services/
    messaging/  Typed message bus over chrome.runtime
    storage/    Per-entity store contracts + memory / IndexedDB implementations
  settings/     User settings over chrome.storage.sync
  types/        Shared data models (Job, PromptTemplate, UserSettings, ...)
  utils/        Logger, backoff, emitter, id generation
scripts/
  generate-icons.mjs  Regenerates public/icons/ (rerun after changing the icon design)
```

## Design rules

- **No client-side artificial quotas.** The queue throttles only on user-configured concurrency and provider-reported rate limits.
- **Provider-agnostic core.** Nothing outside `src/providers/` may reference a concrete provider; the UI renders from `ProviderDescriptor`s.
- **Every queue transition is persisted** so work survives browser and service-worker restarts.
- **Telemetry is local-only** and off by default.
- **Every module talks to its dependencies through a narrow interface**, not a concrete class (`JobEventSource`, `JobSource`, `JobSink`, `HistorySource`, `TemplateSink`, ...) — keeps modules independently testable and keeps the dependency graph honest.

## Verification

Two layers, deliberately: unit tests catch logic bugs; a real-extension load catches integration bugs unit tests structurally can't (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#real-extension-verification) for the one bug this actually caught).

- `npm test` — 122 tests across every module.
- The built extension has been loaded as a real unpacked MV3 extension in real Chromium (via Playwright's `--load-extension`) and driven through the full golden path above against the real background service worker, `chrome.storage`, and `chrome.downloads` — not mocks.

## Known gaps

- **No real provider is wired up.** The mock provider proves the entire architecture end to end, but there's no integration with an actual paid image/video API (OpenAI Images, Stability AI, Replicate, etc.) yet — that needs a user-supplied API key and would be untestable in a sandboxed environment without one. `ProviderAdapter` is ready for it; see `src/providers/`.
