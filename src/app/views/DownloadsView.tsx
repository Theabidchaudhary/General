import type { DownloadTask } from '@/types/models';
import { useAppStore } from '../store';

const STATE_STYLES: Record<DownloadTask['state'], string> = {
  queued: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

/** Tracked download tasks: progress, failures, and retry — driven by completed jobs' outputs. */
export function DownloadsView() {
  const tasks = useAppStore((s) => s.downloadTasks);
  const retryDownload = useAppStore((s) => s.retryDownload);
  const lastError = useAppStore((s) => s.lastError);

  return (
    <section aria-labelledby="downloads-heading" className="space-y-3">
      <h2 id="downloads-heading" className="text-base font-semibold">
        Downloads
      </h2>

      {lastError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {lastError}
        </p>
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No downloads yet. Use "Download" on a completed job to save its output.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm" title={task.target.filename}>
                  {task.target.filename}
                </p>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATE_STYLES[task.state]}`}
                >
                  {task.state}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {task.target.kind}
                {task.bytesReceived !== undefined && ` · ${task.bytesReceived} bytes`}
                {task.error && ` · ${task.error.code}: ${task.error.message}`}
              </p>
              {task.state === 'failed' && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => void retryDownload(task.id)}
                    className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Retry
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
