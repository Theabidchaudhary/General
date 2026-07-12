import { useState } from 'react';
import { pickDefaultProvider } from '../providerSelection';
import { useAppStore } from '../store';

/** At-a-glance queue health, quick enqueue of a test job, and timed job scheduling. */
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

      {defaultProvider && connected && <ScheduleSection providerId={defaultProvider.id} />}
    </section>
  );
}

function ScheduleSection({ providerId }: { providerId: string }) {
  const scheduledJobs = useAppStore((s) => s.scheduledJobs);
  const scheduleJob = useAppStore((s) => s.scheduleJob);
  const cancelScheduledJob = useAppStore((s) => s.cancelScheduledJob);

  const [prompt, setPrompt] = useState('');
  const [runAtLocal, setRunAtLocal] = useState('');

  const pending = scheduledJobs.filter((j) => j.state === 'pending');
  const runAtMs = runAtLocal ? new Date(runAtLocal).getTime() : NaN;
  const canSchedule = prompt.trim().length > 0 && Number.isFinite(runAtMs) && runAtMs > Date.now();

  async function submit() {
    if (!canSchedule) return;
    const created = await scheduleJob(
      { providerId, kind: 'image', prompt: prompt.trim(), params: {} },
      runAtMs,
    );
    if (created) {
      setPrompt('');
      setRunAtLocal('');
    }
  }

  return (
    <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <h3 className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Schedule for later</h3>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Prompt to schedule"
          placeholder="Prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          aria-label="Run at"
          type="datetime-local"
          value={runAtLocal}
          onChange={(e) => setRunAtLocal(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          disabled={!canSchedule}
          onClick={() => void submit()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Schedule
        </button>
      </div>

      {pending.length > 0 && (
        <ul className="space-y-1.5">
          {pending.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-2 rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span className="min-w-0 flex-1 truncate" title={job.request.prompt}>
                {job.request.prompt}
              </span>
              <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                {new Date(job.runAt).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => void cancelScheduledJob(job.id)}
                className="shrink-0 rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
