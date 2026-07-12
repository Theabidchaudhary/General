# Changelog

## Unreleased — Prompt Library

### Fixed

- **Queue engine: retrying/waiting jobs could be stranded forever.** `#scheduleWakeup`'s timer callback assumed that once it fired, `Date.now() >= job.nextAttemptAt` would hold and called `#pump()` directly. Under real timer/clock granularity (most visible with very short retry delays), the callback can fire at a `Date.now()` reading a millisecond below `nextAttemptAt`; `#pump()`'s eligibility check would then skip the job, and since nothing else ever re-checks it, the job stayed in `retrying`/`waiting` indefinitely. Found via ~50%-flaky queue engine tests, root-caused with an instrumented repro (see `src/queue/engine.ts` `#scheduleWakeup`), and fixed by self-healing: if the job isn't yet eligible when the timer fires, reschedule instead of dropping it. Verified with 30+ consecutive clean test runs after the fix (previously failing at roughly 1-in-2).



### Added

- `src/prompts/variables.ts`: `{{variable}}` extraction, single-template expansion, and cartesian-product matrix expansion (for the upcoming Batch Engine).
- `src/prompts/library.ts`: `PromptLibrary` service with create/update/delete/list and validation, backed by a new `TemplateStore` interface (`MemoryTemplateStore` for tests, `IndexedDbTemplateStore` for the extension).
- Consolidated IndexedDB access behind `src/services/storage/db.ts` — a single shared connection/version so job and template stores can't collide on database version.
- Message bus: `prompts/list`, `prompts/save`, `prompts/delete`.
- Side panel: full Prompts view — create/edit/delete templates, live variable detection while typing, and a "Use" flow that fills variables and enqueues a job from the expanded prompt.
- 16 new tests (variable expansion, prompt library CRUD/validation).

## 0.1.0 — Foundation

Initial project foundation per the engineering specification.

### Added

- MV3 scaffold: manifest, background service worker, side panel entry, content-script build (IIFE), Vite + strict TypeScript + Tailwind 4 + ESLint + Vitest toolchain.
- Shared data models (`Job`, `PromptTemplate`, `ProviderCapability`, `DownloadTask`, `QueueItem`, `HistoryRecord`, `UserSettings`, `AnalyticsSnapshot`).
- Provider abstraction layer: `ProviderAdapter` interface, `ProviderRegistry`, normalized `ProviderError` codes, and a scriptable `MockProvider` for development/tests.
- Queue engine: pending → validating → running → waiting/retrying → completed/failed → downloaded state machine, configurable concurrency, priority ordering, exponential backoff with jitter, rate-limit aware waiting, cancellation, and persistence via `JobStore` (IndexedDB in production, memory in tests) with restart recovery.
- Typed message bus over `chrome.runtime` with a single compile-time checked message contract.
- Side panel UI shell (React + Zustand): Dashboard with live stats and test-job enqueue, Jobs view with pause/resume/cancel/remove, Settings with queue concurrency; remaining views stubbed with milestone labels.
- Structured namespaced logger with an in-memory ring buffer exposed over the bus.
- Test suite: 40+ unit/integration tests covering backoff, emitter, job stores, provider registry, mock provider, message bus, and queue engine behavior.
- Documentation: README, architecture notes, engineering specification.
