/**
 * Side panel application state (Zustand).
 *
 * All queue/provider data flows through the message bus — the UI never talks
 * to providers or storage directly. Outside an extension context (plain
 * `vite dev` in a tab), the bus is unavailable and the store flags itself
 * as disconnected so views can render a helpful notice instead of crashing.
 */

import { create } from 'zustand';
import type { Job, JobRequest } from '@/types/models';
import type { ProviderDescriptor } from '@/providers/types';
import { MessageBusError, sendMessage } from '@/services/messaging/bus';

export type ViewId =
  | 'dashboard'
  | 'jobs'
  | 'prompts'
  | 'downloads'
  | 'history'
  | 'analytics'
  | 'settings';

export const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'history', label: 'History' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
];

interface AppState {
  activeView: ViewId;
  connected: boolean;
  jobs: Job[];
  paused: boolean;
  maxConcurrent: number;
  providers: ProviderDescriptor[];
  lastError: string | undefined;

  setActiveView(view: ViewId): void;
  refresh(): Promise<void>;
  enqueue(request: JobRequest, priority?: number): Promise<void>;
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  removeJob(jobId: string): Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  async function guarded(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      set({ lastError: undefined, connected: true });
    } catch (error) {
      if (error instanceof MessageBusError) {
        set({ connected: false, lastError: error.message });
      } else {
        set({ lastError: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return {
    activeView: 'dashboard',
    connected: true,
    jobs: [],
    paused: false,
    maxConcurrent: 2,
    providers: [],
    lastError: undefined,

    setActiveView: (view) => set({ activeView: view }),

    refresh: () =>
      guarded(async () => {
        const [queueState, providerState] = await Promise.all([
          sendMessage('queue/list', {}),
          sendMessage('providers/list', {}),
        ]);
        set({
          jobs: queueState.jobs,
          paused: queueState.paused,
          maxConcurrent: queueState.maxConcurrent,
          providers: providerState.providers,
        });
      }),

    enqueue: (request, priority) =>
      guarded(async () => {
        await sendMessage('queue/enqueue', priority !== undefined ? { request, priority } : { request });
        await get().refresh();
      }),

    pauseQueue: () =>
      guarded(async () => {
        const { paused } = await sendMessage('queue/pause', {});
        set({ paused });
      }),

    resumeQueue: () =>
      guarded(async () => {
        const { paused } = await sendMessage('queue/resume', {});
        set({ paused });
      }),

    cancelJob: (jobId) =>
      guarded(async () => {
        await sendMessage('queue/cancel', { jobId });
        await get().refresh();
      }),

    removeJob: (jobId) =>
      guarded(async () => {
        await sendMessage('queue/remove', { jobId });
        await get().refresh();
      }),
  };
});
