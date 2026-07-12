import { useState } from 'react';
import type { HistoryQuery } from '@/history/service';
import type { HistoryRecord } from '@/types/models';
import { useAppStore } from '../store';

/** Returns a copy of query with `text` set, or removed entirely if blank (exactOptionalPropertyTypes forbids `text: undefined`). */
function withText(query: HistoryQuery, text: string): HistoryQuery {
  const { text: _current, ...rest } = query;
  return text ? { ...rest, text } : rest;
}

/** Returns a copy of query with `finalState` toggled on/off. */
function toggleFinalState(query: HistoryQuery, state: HistoryRecord['finalState']): HistoryQuery {
  const { finalState: _current, ...rest } = query;
  return query.finalState === state ? rest : { ...rest, finalState: state };
}

const STATE_STYLES: Record<HistoryRecord['finalState'], string> = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  downloaded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Searchable archive of finished jobs (completed, downloaded, or failed). */
export function HistoryView() {
  const records = useAppStore((s) => s.historyRecords);
  const query = useAppStore((s) => s.historyQuery);
  const setHistoryQuery = useAppStore((s) => s.setHistoryQuery);
  const [text, setText] = useState(query.text ?? '');

  return (
    <section aria-labelledby="history-heading" className="space-y-3">
      <h2 id="history-heading" className="text-base font-semibold">
        History
      </h2>

      <div className="flex gap-2">
        <input
          aria-label="Search history"
          placeholder="Search prompts…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void setHistoryQuery(withText(query, text));
          }}
          className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          onClick={() => void setHistoryQuery(withText(query, text))}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          Search
        </button>
        {(query.text || query.finalState || query.providerId) && (
          <button
            type="button"
            onClick={() => {
              setText('');
              void setHistoryQuery({});
            }}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-1.5 text-xs">
        {(['completed', 'downloaded', 'failed'] as const).map((state) => (
          <button
            key={state}
            type="button"
            aria-pressed={query.finalState === state}
            onClick={() => void setHistoryQuery(toggleFinalState(query, state))}
            className={
              query.finalState === state
                ? 'rounded px-2 py-0.5 font-medium bg-indigo-600 text-white'
                : 'rounded px-2 py-0.5 font-medium text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }
          >
            {state}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No matching history. Finished jobs appear here automatically.
        </p>
      ) : (
        <ul className="space-y-2">
          {records.map((record) => (
            <li
              key={record.id}
              className="rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm" title={record.request.prompt}>
                  {record.request.prompt}
                </p>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATE_STYLES[record.finalState]}`}
                >
                  {record.finalState}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {record.request.providerId} · {record.request.kind} · {formatDuration(record.durationMs)} ·{' '}
                {new Date(record.finishedAt).toLocaleString()}
                {record.error && ` · ${record.error.code}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
