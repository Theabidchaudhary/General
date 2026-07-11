import { useState } from 'react';
import { sendMessage } from '@/services/messaging/bus';
import { useAppStore } from '../store';

/**
 * Queue-level settings available in the foundation build. The full settings
 * module (sync storage, theme, downloads, notifications) lands with its own
 * milestone; concurrency is wired now because the engine already supports it.
 */
export function SettingsView() {
  const maxConcurrent = useAppStore((s) => s.maxConcurrent);
  const refresh = useAppStore((s) => s.refresh);
  const connected = useAppStore((s) => s.connected);
  const [pendingValue, setPendingValue] = useState<number | undefined>(undefined);

  const value = pendingValue ?? maxConcurrent;

  return (
    <section aria-labelledby="settings-heading" className="space-y-4">
      <h2 id="settings-heading" className="text-base font-semibold">
        Settings
      </h2>

      <div className="space-y-1">
        <label htmlFor="max-concurrent" className="block text-sm font-medium">
          Max concurrent jobs
        </label>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          How many jobs may run at the same time across all providers.
        </p>
        <div className="flex items-center gap-2">
          <input
            id="max-concurrent"
            type="number"
            min={1}
            max={10}
            value={value}
            disabled={!connected}
            onChange={(e) => setPendingValue(Number(e.target.value))}
            className="w-20 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            disabled={!connected || pendingValue === undefined}
            onClick={() => {
              void sendMessage('queue/set-concurrency', { maxConcurrent: value }).then(() => {
                setPendingValue(undefined);
                void refresh();
              });
            }}
            className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Additional settings (theme, auto-download, notifications, telemetry opt-in) arrive with the
        Settings module milestone.
      </p>
    </section>
  );
}
