import type { Job, JobState } from '@/types/models';
import { useAppStore } from '../store';

const STATE_STYLES: Record<JobState, string> = {
  pending: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  validating: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  running: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  waiting: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  retrying: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  downloaded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

const ACTIVE_STATES: JobState[] = ['pending', 'validating', 'running', 'waiting', 'retrying'];

/** Live job list with pause/resume and per-job cancel/remove controls. */
export function JobsView() {
  const jobs = useAppStore((s) => s.jobs);
  const paused = useAppStore((s) => s.paused);
  const pauseQueue = useAppStore((s) => s.pauseQueue);
  const resumeQueue = useAppStore((s) => s.resumeQueue);
  const cancelJob = useAppStore((s) => s.cancelJob);
  const removeJob = useAppStore((s) => s.removeJob);
  const lastError = useAppStore((s) => s.lastError);

  return (
    <section aria-labelledby="jobs-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="jobs-heading" className="text-base font-semibold">
          Jobs
        </h2>
        <button
          type="button"
          onClick={() => void (paused ? resumeQueue() : pauseQueue())}
          className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {paused ? 'Resume queue' : 'Pause queue'}
        </button>
      </div>

      {lastError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {lastError}
        </p>
      )}

      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No jobs yet. Enqueue one from the Dashboard.
        </p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onCancel={() => void cancelJob(job.id)}
              onRemove={() => void removeJob(job.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function JobRow({
  job,
  onCancel,
  onRemove,
}: {
  job: Job;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const isActive = ACTIVE_STATES.includes(job.state);
  return (
    <li className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm" title={job.request.prompt}>
          {job.request.prompt}
        </p>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATE_STYLES[job.state]}`}
        >
          {job.state}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {job.request.providerId} · {job.request.kind} · attempt {job.attempts}/{job.maxAttempts}
        {job.error && ` · ${job.error.code}`}
      </p>
      <div className="mt-2 flex gap-2">
        {isActive ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-rose-300 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}
