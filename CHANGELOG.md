# Changelog

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
