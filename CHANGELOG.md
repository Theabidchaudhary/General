# Changelog

## Unreleased — Notifications

### Added

- `src/notifications/`: `NotificationManager` fires a browser notification once per job on its first completion or failure (not again if a completed job is later downloaded), via a `NotificationDriver` abstraction (`ChromeNotificationDriver` / `MockNotificationDriver`), gated by `Settings.notificationsEnabled`.
- 7 new tests.

## Unreleased — Import/Export

### Added

- `src/importExport/service.ts`: `ImportExportService` bundles templates, settings, and history into a versioned JSON `ExportBundle`, and restores one back in. Templates import as new entries (fresh ids); history merges by `jobId` via a new `HistoryService.importRecords()`; settings overwrite through the normal validated `update()` path.
- Message bus: `io/export`, `io/import`.
- Side panel: "Export data" (downloads a JSON file) / "Import data" (file picker) in Settings.
- 10 new tests.

## Unreleased — Scheduler

### Added

- `src/scheduler/service.ts`: `Scheduler` fires jobs scheduled for a future time (`ScheduledJob`, new `ScheduledJobStore`) and, via a `chrome.alarms` heartbeat (`aiwf-heartbeat`, 1-minute period — the platform's minimum granularity), durably wakes the MV3 service worker so a torn-down worker doesn't strand a pending retry or timed job indefinitely.
- Message bus: `scheduler/list`, `scheduler/create`, `scheduler/cancel`.
- Side panel: a "Schedule for later" section on the Dashboard (prompt + date/time + pending list with cancel) — no new nav tab, since the spec's UX list doesn't call for one.
- 10 new tests (108 total).

## Unreleased — Settings

### Added

- `src/settings/`: `SettingsService` over `chrome.storage.sync` (`ChromeSyncSettingsStore`; `MemorySettingsStore` for tests) — theme, default provider, max concurrent jobs, max retry attempts, auto-download, download subfolder, notifications toggle, telemetry toggle. Every change is applied live to the queue engine, download manager, and (in a future milestone) notifications — no worker restart required.
- Theme support: an explicit light/dark choice now overrides the OS preference (previously `dark:` only ever followed `prefers-color-scheme`). `system` still tracks the OS live. Verified via headless browser that selecting "dark" flips the UI even when the OS/page reports light.
- `pickDefaultProvider()`: Dashboard and Prompt Library now enqueue against the configured default provider (falling back to the first available) instead of always the first provider in the list.
- Message bus: `settings/get`, `settings/update`.
- Side panel: full Settings form for every field above.
- Small additive API surface to make settings actually take effect: `QueueEngine.setDefaultMaxAttempts()`, `DownloadManager.setSubfolder()`.
- 6 new tests (98 total).

## Unreleased — Analytics

### Added

- `src/analytics/service.ts`: `AnalyticsService` computes an `AnalyticsSnapshot` (totals by final state, average duration, breakdown by provider and media kind) on demand from History records — no separate persisted snapshot store, so it can't drift out of sync with History.
- Message bus: `analytics/snapshot`.
- Side panel: Analytics view with a stat-tile KPI row and two magnitude bar breakdowns, following the dataviz skill's guidance (single sequential hue for magnitude comparisons, not a categorical palette; text never carries the data color).
- 5 new tests (92 total).

## Unreleased — History

### Added

- `src/history/service.ts`: `HistoryService` archives every job that reaches a terminal state (completed/failed/downloaded) into a persisted, searchable `HistoryRecord`. Updates the same record in place if a job later moves completed → downloaded, rather than duplicating it.
- New `HistoryStore` (memory + IndexedDB), added to the shared database.
- Message bus: `history/list` (text/provider/final-state query).
- Side panel: History view with search, state filter chips, and duration/timestamp display.
- 9 new tests (87 total).

## Unreleased — Download Manager

### Added

- `src/downloads/`: `DownloadManager` turns a completed job's outputs into tracked, retryable downloads via a provider-adapter-style `DownloadDriver` abstraction (`ChromeDownloadDriver` for the real extension, `MockDownloadDriver` for tests). Tracks per-output `DownloadTask`s (queued → in_progress → completed/failed) with byte progress, persisted through a new `DownloadStore` (IndexedDB-backed in production). When every output of a job finishes downloading, the job transitions to `'downloaded'`.
- Message bus: `downloads/list`, `downloads/start`, `downloads/retry`.
- Side panel: completed jobs get a "Download" action in the Jobs view; the new Downloads view lists tasks with state, byte progress, and a "Retry" action for failures.
- `autoDownload` support (off by default, matching `DEFAULT_SETTINGS`) — downloads every job automatically the moment it completes, for when the Settings module exposes the toggle.
- 13 new tests (78 total). Verified the create-job → download → Downloads-view flow end to end in a headless browser against a mocked background worker.

### Fixed

- Two ordering bugs surfaced while stabilizing the new tests, both the same underlying mistake — code assuming a caller has "caught up" to an async operation before an event fires:
  - `DownloadManager` chained the job's `'downloaded'` transition via `.then()` *after* persisting/emitting the download task's own `'completed'` update, so a listener reacting to that event could observe the job still `'completed'` instead of `'downloaded'`. Reordered so the job-level side effect happens first.
  - `MockDownloadDriver` scheduled its progress/completion events with `queueMicrotask`, which can fire before the caller's `await driver.start(...)` continuation runs (i.e. before it has recorded the returned handle) — silently dropping the event, and stalling `DownloadManager` in the same way. Switched to macrotask (`setTimeout(0)`) scheduling, matching the fix applied to the queue engine's retry-wakeup timer earlier.

## Unreleased — Batch Engine

### Added

- `src/queue/batch.ts`: `BatchEngine` fans a prompt template + variable-option matrix out into one queued job per cartesian-product combination, via the existing `expandMatrix()` helper. Validates up front (no empty-option variables, capped at `MAX_BATCH_SIZE` = 50 jobs) so a mistyped matrix can't silently produce zero or thousands of jobs.
- `JobRequest.batchId`: jobs created by a batch submission share a `batchId` so they can be grouped later (history/analytics).
- Message bus: `batch/submit`.
- Side panel: "Batch" action on templates with variables, opening a dialog to enter comma-separated options per variable with a live job-count preview and over-limit warning.
- 8 new tests for `BatchEngine` (65 total).

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
