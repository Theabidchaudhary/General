import { pickDefaultProvider } from '../providerSelection';
import { useAppStore } from '../store';

/** At-a-glance queue health plus quick enqueue of a test job. */
export function DashboardView() {
  const jobs = useAppStore((s) => s.jobs);
  const paused = useAppStore((s) => s.paused);
  const providers = useAppStore((s) => s.providers);
  const enqueue = useAppStore((s) => s.enqueue);
  const connected = useAppStore((s) => s.connected);
  const defaultProviderId = useAppStore((s) => s.settings.defaultProviderId);

  const active = jobs.filter((j) =>
    ['pending', 'validating', 'running', 'waiting', 'retrying'].includes(j.state),
  ).length;
  const completed = jobs.filter((j) => j.state === 'completed' || j.state === 'downloaded').length;
  const failed = jobs.filter((j) => j.state === 'failed').length;

  const defaultProvider = pickDefaultProvider(providers, defaultProviderId);

  return (
    <section aria-labelledby="dashboard-heading" className="space-y-4">
      <h2 id="dashboard-heading" className="text-base font-semibold">
        Dashboard
      </h2>

      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Active" value={active} />
        <Stat label="Completed" value={completed} />
        <Stat label="Failed" value={failed} />
      </dl>

      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Queue is <strong>{paused ? 'paused' : 'running'}</strong>
        {providers.length > 0 && (
          <>
            {' '}
            · Providers: {providers.map((p) => p.name).join(', ')}
          </>
        )}
      </p>

      {defaultProvider && connected && (
        <button
          type="button"
          onClick={() =>
            void enqueue({
              providerId: defaultProvider.id,
              kind: 'image',
              prompt: `Test render ${new Date().toLocaleTimeString()}`,
              params: {},
            })
          }
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          Enqueue test job
        </button>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
