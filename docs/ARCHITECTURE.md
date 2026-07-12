# Architecture Notes

Status of each module against [SPECIFICATION.md](SPECIFICATION.md), plus the decisions that shape the codebase. Update this file whenever a module lands or an interface changes.

## Module status

| Module | Status | Notes |
| --- | --- | --- |
| Foundation (build, config, types) | ✅ Implemented | Vite dual-build (app + IIFE content script), strict TS, Tailwind 4 |
| UI shell (side panel) | ✅ Implemented | Dashboard, Jobs, Prompts, Downloads live; History/Analytics/Settings still partial or stubbed |
| Provider layer | ✅ Implemented | `ProviderAdapter` interface, registry, error normalization, mock provider |
| Queue engine | ✅ Implemented | Full state machine, concurrency, priority, retry/backoff, persistence |
| Message bus | ✅ Implemented | Typed request/response map over `chrome.runtime` |
| Prompt library / variables | ✅ Implemented | CRUD + `{{variable}}` extraction/expansion, IndexedDB-backed |
| Batch engine | ✅ Implemented | Fans a template + variable matrix into N queued jobs via `expandMatrix()`; capped at `MAX_BATCH_SIZE` (50) |
| Downloads | ✅ Implemented | `DownloadManager` over a `DownloadDriver` abstraction (chrome.downloads / scriptable mock); progress, retry, auto-download opt-in |
| History | ✅ Implemented | `HistoryService` archives every job that reaches a terminal state; search by text/provider/state |
| Analytics | ✅ Implemented | `AnalyticsService` derives a snapshot from History on demand; local-only |
| Scheduler | ⬜ Planned | Milestone 10; will move retry timers onto `chrome.alarms` |
| Settings module | ✅ Implemented | `SettingsService` over `chrome.storage.sync`; theme, concurrency, retries, auto-download, subfolder, notifications, telemetry toggle, default provider — all wired live into the subsystems that consume them |
| Notifications | ⬜ Planned | |
| Import/export | ⬜ Planned | |

## Key decisions

### Queue engine (`src/queue/engine.ts`)

- **State machine:** `pending → validating → running → (waiting | retrying)* → completed → downloaded`, with `failed` terminal. `waiting` is reserved for provider rate limits (honors `retryAfterMs`); `retrying` covers other retryable errors with exponential backoff + jitter (`src/utils/backoff.ts`).
- **Attempts** count provider submissions. Validation failures happen before an attempt and never retry.
- **Persistence:** every transition is written through the `JobStore` interface. The background worker uses `IndexedDbJobStore`; tests use `MemoryJobStore`. On `restore()`, jobs found in `validating`/`running` (interrupted by a worker restart) are reset to `pending`.
- **Cancellation:** in-flight jobs get an `AbortController`; the runner observes the abort and finalizes the job as `failed`/`CANCELLED`. Provider-side cancel is best-effort.
- **Timers:** retry wake-ups currently use `setTimeout`. MV3 service workers can be torn down after ~30s idle; the Scheduler milestone replaces these with `chrome.alarms`. `restore()` already reschedules pending wake-ups, so a teardown delays a retry rather than losing it.
- **Wakeup timer is self-healing:** a `setTimeout` firing is only guaranteed to happen *no earlier* than the requested delay — clock/timer granularity can still leave `Date.now()` reading a millisecond below `job.nextAttemptAt` when the callback runs (most visible at very short delays, e.g. in tests). `#scheduleWakeup`'s callback checks for this and reschedules itself if the job isn't actually eligible yet, rather than calling `#pump()` and silently stranding the job in `retrying`/`waiting` forever (nothing else would ever re-check it). This was a real bug, not just test flakiness — see the CHANGELOG entry.

### Provider layer (`src/providers/`)

- All provider failures are normalized into `ProviderError` with a closed set of `ErrorCode`s and a per-code default retryability. The queue makes retry decisions from `retryable`/`retryAfterMs` only — never from provider-specific messages.
- `ProviderRegistry` is the single lookup point. UI receives serializable `ProviderDescriptor`s via the bus; it must never import a concrete adapter.
- `MockProvider` is a first-class adapter whose behavior is scripted through request params, used by both the test suite and manual QA.

### Prompt library (`src/prompts/`)

- `variables.ts` is pure and dependency-free: `extractVariables()` finds `{{name}}` references (identifier-charset only, no arbitrary template syntax), `expandTemplate()` substitutes them and throws `MissingVariableError` if any are unfilled, and `expandMatrix()` produces the cartesian product of a variable-option matrix — this is what the Batch Engine milestone will call to fan a template into many concrete prompts.
- `library.ts` (`PromptLibrary`) owns validation (non-empty name/body) and recomputes `variables` from the body on every save, so the stored list is never stale relative to the text.
- Storage follows the same `*Store` interface pattern as jobs (`TemplateStore` / `MemoryTemplateStore` / `IndexedDbTemplateStore`). Because both job and template stores live in the same IndexedDB database, they now share one connection opened by `src/services/storage/db.ts` — opening the same database name at two different versions from separate modules throws `VersionError`, so any new IndexedDB-backed store must register its object store in `db.ts`, not open its own connection.

### Batch engine (`src/queue/batch.ts`)

- `BatchEngine.submit()` validates the variable matrix up front (every variable must have at least one option; the cartesian-product size is checked against `MAX_BATCH_SIZE` before expansion, not after — a mistyped matrix can't silently materialize thousands of jobs), then calls `expandMatrix()` and enqueues one job per resulting prompt via the injected `QueueEngine`, sequentially so creation order (and therefore FIFO priority tie-breaking) is deterministic.
- Every job created by a batch carries the same `Job.request.batchId` (added to `JobRequest`) so the UI/history can group them later; `templateId` is also carried through when the batch came from a saved template.
- Depends only on `QueueEngine`'s public `enqueue()` — it has no persistence or retry logic of its own, and reuses `MissingVariableError`/`expandTemplate` validation rather than duplicating it.

### Downloads (`src/downloads/`)

- Mirrors the provider adapter pattern: `DownloadManager` depends only on a `DownloadDriver` interface (`start`/`onEvent`/`cancel`), never on `chrome.downloads` directly. `ChromeDownloadDriver` wraps the real API; `MockDownloadDriver` scripts progress/failure/retry behavior off `DownloadTarget.filename` prefixes (`fail-once:`, `fail-always:`) for tests.
- `DownloadManager` itself depends on queue engine only through a narrow `JobSource` interface (`events`, `getJob`, `markDownloaded`) rather than the concrete `QueueEngine` class — `QueueEngine` uses true private (`#`) fields, so a duck-typed test double can't structurally satisfy the class type; narrowing to an interface keeps the module testable without the full queue+provider stack and keeps the dependency intentionally minimal.
- `downloadJob(jobId)` starts one `DownloadTask` per job output not already downloading/downloaded (matched by `target.url`); `retry(taskId)` re-attempts a failed task reusing its id. When every output of a job reaches `'completed'`, the job is transitioned to `'downloaded'` via `queue.markDownloaded()`.
- **Ordering guarantee:** on a driver `'completed'` event, `#maybeMarkJobDownloaded()` runs *before* the task's own `'task-updated'` event is persisted/emitted — found via a real bug where a test observing the completed task-updated event and then immediately checking the job's state saw it still `'completed'` instead of `'downloaded'`, because the mark-downloaded step was chained via `.then()` *after* persistence (which itself emits synchronously before its promise settles). Listeners of `'task-updated'` can now rely on the job-level side effect having already happened.
- `MockDownloadDriver` schedules its progress/completion events with `setTimeout(0)`, not `queueMicrotask` — a microtask-scheduled event can fire before the caller's `await driver.start(...)` continuation runs (i.e. before the handle is recorded), silently dropping the event. This is the same class of "assume the caller has caught up" ordering bug as the queue engine's wakeup-timer fix; both mock drivers in this codebase now favor macrotasks for anything a caller must react to after an awaited call resolves.
- `autoDownload` is off by default (`DEFAULT_SETTINGS.autoDownload`); when enabled it subscribes to the queue's `'job-updated'` event and downloads every job the moment it completes. Manual download is exposed via the Jobs view's "Download" button on completed jobs and the Downloads view's per-task "Retry".
- Restart recovery: `restore()` marks any `'queued'`/`'in_progress'` task as a retryable failure, since the driver handle correlating it to a live transfer is lost across a service-worker restart (chrome.downloads itself doesn't expose a way to re-attach to an in-flight download by our own task id).

### History (`src/history/`)

- `HistoryService` subscribes to the same `job-updated` event stream as everything else, through a minimal `JobEventSource` interface (just `events`) rather than the `JobSource` interface downloads/manager.ts defines — History doesn't need `getJob`/`markDownloaded`, so it gets its own narrower dependency rather than reusing a bigger one.
- One record per job, keyed internally by `jobId`: writing happens on the job's *first* terminal state (`completed`/`failed`/`downloaded`) and is updated in place (same `HistoryRecord.id`) if the job later moves `completed` → `downloaded`, so a downloaded job doesn't show up twice.
- `list(query)` filters and sorts in memory (case-insensitive prompt substring, provider, final state; newest-finished first). No pagination yet — fine at the scale this module will see before a dedicated index/pagination pass is warranted.

### Analytics (`src/analytics/`)

- `AnalyticsService.computeSnapshot()` derives an `AnalyticsSnapshot` on demand from History's records (through a minimal `HistorySource` interface, same narrow-dependency pattern as History's `JobEventSource`) — no separate persisted snapshot table; History is already the source of truth for finished-job data, so a fresh computation each time is simpler and can't drift out of sync with it.
- UI breakdown bars (jobs by provider, jobs by kind) use a single sequential hue sized by magnitude, not a categorical palette — per the dataviz skill, categorical color is for *distinguishing identities*, and here identity is already carried by the row's text label; the count is a *magnitude* comparison, for which "one hue, more is darker/longer" is the correct default. Text (labels, values) always uses neutral text-token colors, never the bar's fill color.

### Settings (`src/settings/`)

- `SettingsService` merges persisted overrides with `DEFAULT_SETTINGS` (so a corrupted/partial stored object never leaves a field `undefined`), clamps `maxConcurrentJobs`/`maxAttempts` to `Math.max(1, Math.floor(value))` — deliberately matching `QueueEngine.setMaxConcurrent`'s own clamping exactly, so a value that round-trips through both never changes — and falls back to `DEFAULT_SETTINGS.theme` for anything outside the three valid theme values.
- Persistence is `chrome.storage.sync` (`ChromeSyncSettingsStore`), not IndexedDB — the one store in this codebase that isn't behind `db.ts`, per the architecture's explicit "Chrome Storage Sync" pairing for user settings so they follow a signed-in user across machines. `MemorySettingsStore` covers tests.
- `background/index.ts` applies settings to every consuming subsystem — `queue.setMaxConcurrent()`, `queue.setDefaultMaxAttempts()`, `downloadManager.setAutoDownload()`, `downloadManager.setSubfolder()` — both once on restore and again on every `settings-changed` event, so a change takes effect immediately without a worker restart.
- Theme: `styles.css` redefines Tailwind's `dark:` variant against `[data-theme="dark"]` instead of the `prefers-color-scheme` media query (`@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));`), and `useTheme()` (`src/app/useTheme.ts`) always writes an explicit `data-theme` onto `<html>` — resolving `'system'` via `matchMedia` and staying subscribed to OS changes only while `'system'` is selected. This is what lets an explicit "dark" choice override the OS preference; without redefining the variant, `dark:` utilities would only ever follow the OS.
- `defaultProviderId` is honored by `pickDefaultProvider()` (`src/app/providerSelection.ts`), used by both the Dashboard's quick-enqueue and the Prompt Library's Use/Batch dialogs, falling back to the first available provider if the configured default no longer exists.

### Messaging (`src/services/messaging/`)

- One `MessageMap` type is the wire contract; both `sendMessage()` and the background router derive their types from it, so adding a message is a one-file change that the compiler enforces on both ends.
- Messages travel in an `{ channel: 'aiwf' }` envelope so unrelated runtime messages are ignored.

### Build (`vite.config.ts`, `vite.config.content.ts`)

- The side panel (HTML entry) and background worker (ES module) build together; the content script builds separately as a self-contained IIFE because MV3 content scripts cannot be ES modules.
- `public/manifest.json` registers no static content scripts: provider integrations register `content.js` dynamically via `chrome.scripting` with provider-specific match patterns, keeping host permissions minimal.

## Testing conventions

- Tests are colocated (`*.test.ts`) and run in a Node environment; `chrome.*` is stubbed per-test (see `bus.test.ts`).
- Queue tests run against `MemoryJobStore` + `MockProvider` with millisecond backoff/poll intervals; they assert on the event stream (`job-updated`) rather than sleeping.
