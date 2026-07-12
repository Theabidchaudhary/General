import { useEffect, useState } from 'react';
import type { UserSettings } from '@/types/models';
import { useAppStore } from '../store';

/** Full settings form: theme, queue/download behavior, notifications, and telemetry — persisted via chrome.storage.sync. */
export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const providers = useAppStore((s) => s.providers);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const connected = useAppStore((s) => s.connected);
  const lastError = useAppStore((s) => s.lastError);

  const [draft, setDraft] = useState<UserSettings>(settings);
  const [saved, setSaved] = useState(false);

  // Re-sync the draft when settings load from the background worker (e.g. on
  // first connect), but not on every 2s poll — only when they actually differ,
  // so mid-edit values aren't clobbered by the periodic refresh.
  useEffect(() => {
    setDraft((current) => (JSON.stringify(current) === JSON.stringify(settings) ? current : settings));
  }, [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  async function save() {
    await updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section aria-labelledby="settings-heading" className="space-y-5">
      <h2 id="settings-heading" className="text-base font-semibold">
        Settings
      </h2>

      {lastError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {lastError}
        </p>
      )}

      <Field label="Theme" description="Light/dark follows this choice; system tracks your OS.">
        <select
          value={draft.theme}
          disabled={!connected}
          onChange={(e) => setDraft({ ...draft, theme: e.target.value as UserSettings['theme'] })}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </Field>

      <Field label="Default provider" description="Used when enqueuing from the Dashboard and Prompt Library.">
        <select
          value={draft.defaultProviderId ?? ''}
          disabled={!connected || providers.length === 0}
          onChange={(e) =>
            setDraft({ ...draft, ...(e.target.value ? { defaultProviderId: e.target.value } : {}) })
          }
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">First available</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Max concurrent jobs" description="How many jobs may run at the same time across all providers.">
        <input
          type="number"
          min={1}
          max={10}
          value={draft.maxConcurrentJobs}
          disabled={!connected}
          onChange={(e) => setDraft({ ...draft, maxConcurrentJobs: Number(e.target.value) })}
          className="w-20 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </Field>

      <Field label="Max retry attempts" description="Default retry budget for new jobs (existing jobs keep theirs).">
        <input
          type="number"
          min={1}
          max={10}
          value={draft.maxAttempts}
          disabled={!connected}
          onChange={(e) => setDraft({ ...draft, maxAttempts: Number(e.target.value) })}
          className="w-20 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </Field>

      <CheckboxField
        label="Auto-download completed jobs"
        description="Downloads every job's output automatically the moment it completes."
        checked={draft.autoDownload}
        disabled={!connected}
        onChange={(checked) => setDraft({ ...draft, autoDownload: checked })}
      />

      <Field label="Download subfolder" description="Relative to your browser's downloads directory.">
        <input
          type="text"
          value={draft.downloadSubfolder}
          disabled={!connected}
          onChange={(e) => setDraft({ ...draft, downloadSubfolder: e.target.value })}
          className="w-48 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </Field>

      <CheckboxField
        label="Notifications"
        description="Show a browser notification when a job completes or fails."
        checked={draft.notificationsEnabled}
        disabled={!connected}
        onChange={(checked) => setDraft({ ...draft, notificationsEnabled: checked })}
      />

      <CheckboxField
        label="Local analytics"
        description="Keep computing the Analytics view from your history. Nothing ever leaves your browser."
        checked={draft.telemetryEnabled}
        disabled={!connected}
        onChange={(checked) => setDraft({ ...draft, telemetryEnabled: checked })}
      />

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!connected || !dirty}
          onClick={() => void save()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Save changes
        </button>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
      </div>
    </section>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      <div id={id}>{children}</div>
    </div>
  );
}

function CheckboxField({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
        />
        {label}
      </label>
      <p className="pl-6 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
    </div>
  );
}
