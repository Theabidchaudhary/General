import { useAppStore } from '../store';

function formatDuration(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Local-only usage insights derived from History. Breakdown bars use a single
 * sequential hue (the app's indigo) sized by magnitude — these compare
 * counts, not distinct identities, so no categorical palette is needed.
 */
export function AnalyticsView() {
  const snapshot = useAppStore((s) => s.analytics);

  if (!snapshot) {
    return (
      <section aria-labelledby="analytics-heading">
        <h2 id="analytics-heading" className="text-base font-semibold">
          Analytics
        </h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="analytics-heading" className="space-y-4">
      <h2 id="analytics-heading" className="text-base font-semibold">
        Analytics
      </h2>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Total finished" value={snapshot.totalJobs} />
        <StatTile label="Completed" value={snapshot.completedJobs} />
        <StatTile label="Failed" value={snapshot.failedJobs} />
        <StatTile label="Downloaded" value={snapshot.downloadedJobs} />
        <StatTile label="Avg. duration" value={formatDuration(snapshot.averageDurationMs)} />
      </dl>

      {snapshot.totalJobs === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No finished jobs yet — breakdowns appear once jobs complete.
        </p>
      ) : (
        <>
          <BarBreakdown title="Jobs by provider" counts={snapshot.jobsByProvider} />
          <BarBreakdown title="Jobs by kind" counts={snapshot.jobsByKind} />
        </>
      )}
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function BarBreakdown({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, count]) => count));

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{title}</h3>
      <ul className="space-y-1.5">
        {entries.map(([label, count]) => (
          <li key={label} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-xs text-neutral-700 dark:text-neutral-300" title={label}>
              {label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-indigo-600"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-600 dark:text-neutral-400">
              {count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
