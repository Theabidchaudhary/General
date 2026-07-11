import { useEffect } from 'react';
import { useAppStore, VIEWS } from './store';
import { DashboardView } from './views/DashboardView';
import { JobsView } from './views/JobsView';
import { PlaceholderView } from './views/PlaceholderView';
import { SettingsView } from './views/SettingsView';

const REFRESH_INTERVAL_MS = 2_000;

export function App() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const connected = useAppStore((s) => s.connected);
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="text-sm font-semibold tracking-wide">AI Workflow Studio</h1>
      </header>

      {!connected && (
        <div
          role="status"
          className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          Not connected to the extension background worker. Load this panel from the installed
          extension to manage the queue.
        </div>
      )}

      <nav aria-label="Primary" className="border-b border-neutral-200 dark:border-neutral-800">
        <ul className="flex flex-wrap gap-1 px-2 py-1.5">
          {VIEWS.map((view) => (
            <li key={view.id}>
              <button
                type="button"
                aria-current={activeView === view.id ? 'page' : undefined}
                onClick={() => setActiveView(view.id)}
                className={
                  activeView === view.id
                    ? 'rounded px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white'
                    : 'rounded px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }
              >
                {view.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 overflow-y-auto p-4">
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'jobs' && <JobsView />}
        {activeView === 'prompts' && (
          <PlaceholderView
            title="Prompt Library"
            milestone="Milestone 5"
            description="Reusable prompt templates with {{variable}} expansion and tagging."
          />
        )}
        {activeView === 'downloads' && (
          <PlaceholderView
            title="Downloads"
            milestone="Milestone 7"
            description="Automatic artifact downloads with progress and retry."
          />
        )}
        {activeView === 'history' && (
          <PlaceholderView
            title="History"
            milestone="Milestone 8"
            description="Searchable archive of finished jobs and their outputs."
          />
        )}
        {activeView === 'analytics' && (
          <PlaceholderView
            title="Analytics"
            milestone="Milestone 9"
            description="Local-only usage insights: throughput, failure rates, provider mix."
          />
        )}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
