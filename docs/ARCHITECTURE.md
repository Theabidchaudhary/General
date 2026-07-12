# Architecture Notes

Status of each module against [SPECIFICATION.md](SPECIFICATION.md), plus the decisions that shape the codebase. Update this file whenever a module lands or an interface changes.

## Module status

| Module | Status | Notes |
| --- | --- | --- |
| Foundation (build, config, types) | ✅ Implemented | Vite dual-build (app + IIFE content script), strict TS, Tailwind 4 |
| UI shell (side panel) | ✅ Implemented | Dashboard + Jobs live; other views stubbed with milestone labels |
| Provider layer | ✅ Implemented | `ProviderAdapter` interface, registry, error normalization, mock provider |
| Queue engine | ✅ Implemented | Full state machine, concurrency, priority, retry/backoff, persistence |
| Message bus | ✅ Implemented | Typed request/response map over `chrome.runtime` |
| Prompt library / variables | ✅ Implemented | CRUD + `{{variable}}` extraction/expansion, IndexedDB-backed |
| Batch engine | ✅ Implemented | Fans a template + variable matrix into N queued jobs via `expandMatrix()`; capped at `MAX_BATCH_SIZE` (50) |
| Downloads | ⬜ Planned | Milestone 7 (`queue/mark-downloaded` hook already exists) |
| History | ⬜ Planned | Milestone 8 |
| Analytics | ⬜ Planned | Milestone 9; local-only |
| Scheduler | ⬜ Planned | Milestone 10; will move retry timers onto `chrome.alarms` |
| Settings module | 🟨 Partial | Concurrency wired end to end; sync-storage settings pending |
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

### Messaging (`src/services/messaging/`)

- One `MessageMap` type is the wire contract; both `sendMessage()` and the background router derive their types from it, so adding a message is a one-file change that the compiler enforces on both ends.
- Messages travel in an `{ channel: 'aiwf' }` envelope so unrelated runtime messages are ignored.

### Build (`vite.config.ts`, `vite.config.content.ts`)

- The side panel (HTML entry) and background worker (ES module) build together; the content script builds separately as a self-contained IIFE because MV3 content scripts cannot be ES modules.
- `public/manifest.json` registers no static content scripts: provider integrations register `content.js` dynamically via `chrome.scripting` with provider-specific match patterns, keeping host permissions minimal.

## Testing conventions

- Tests are colocated (`*.test.ts`) and run in a Node environment; `chrome.*` is stubbed per-test (see `bus.test.ts`).
- Queue tests run against `MemoryJobStore` + `MockProvider` with millisecond backoff/poll intervals; they assert on the event stream (`job-updated`) rather than sleeping.
