# AI Workflow Studio

A Manifest V3 browser extension for AI image/video workflow automation: queue-based job management across multiple providers, prompt templates, automatic downloads, history, and local-only analytics.

Built per the engineering specification in [docs/SPECIFICATION.md](docs/SPECIFICATION.md). Architecture decisions and module status live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

- Manifest V3 (background service worker + side panel + dynamically registered content scripts)
- React 18 + TypeScript (strict) + Vite + Tailwind CSS 4
- Zustand for UI state, IndexedDB for durable queue persistence
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

The foundation ships with a **mock provider** so the queue can be exercised end to end (Dashboard → "Enqueue test job") without any external service.

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
  app/          Side panel React application (views, zustand store)
  background/   Service worker entry: wires queue + providers + message router
  content/      Content script entry (dynamically registered per provider)
  downloads/    Download manager: driver abstraction, progress, retry
  prompts/      Prompt library + {{variable}} expansion
  providers/    Provider abstraction: adapter interface, registry, mock provider
  queue/        Queue engine (state machine, concurrency, retry) + batch engine
  services/
    messaging/  Typed message bus over chrome.runtime
    storage/    Job/template/download store contracts + memory / IndexedDB implementations
  types/        Shared data models (Job, PromptTemplate, UserSettings, ...)
  utils/        Logger, backoff, emitter, id generation
```

## Design rules

- **No client-side artificial quotas.** The queue throttles only on user-configured concurrency and provider-reported rate limits.
- **Provider-agnostic core.** Nothing outside `src/providers/` may reference a concrete provider; the UI renders from `ProviderDescriptor`s.
- **Every queue transition is persisted** so work survives browser and service-worker restarts.
- **Telemetry is local-only** and off by default.
