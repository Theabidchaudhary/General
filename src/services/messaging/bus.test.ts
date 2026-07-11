import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WireResponse } from './messages';
import { createMessageRouter, MessageBusError, sendMessage, type HandlerMap } from './bus';

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

/** Minimal chrome.runtime mock wiring sendMessage to registered listeners. */
function installChromeMock() {
  const listeners = new Set<Listener>();
  const chromeMock = {
    runtime: {
      onMessage: {
        addListener: (fn: Listener) => listeners.add(fn),
        removeListener: (fn: Listener) => listeners.delete(fn),
      },
      sendMessage: (message: unknown) =>
        new Promise((resolve) => {
          let responded = false;
          for (const listener of listeners) {
            const keepOpen = listener(message, {} as chrome.runtime.MessageSender, (response) => {
              responded = true;
              resolve(response);
            });
            if (keepOpen) return;
          }
          if (!responded) resolve(undefined);
        }),
    },
  };
  vi.stubGlobal('chrome', chromeMock);
  return { listeners };
}

function makeHandlers(overrides: Partial<HandlerMap>): HandlerMap {
  return overrides as HandlerMap;
}

describe('message bus', () => {
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    installChromeMock();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.unstubAllGlobals();
  });

  it('round-trips a typed request/response', async () => {
    dispose = createMessageRouter(
      makeHandlers({
        'queue/pause': async () => ({ paused: true }),
      }),
    );
    const response = await sendMessage('queue/pause', {});
    expect(response).toEqual({ paused: true });
  });

  it('passes payloads through to the handler', async () => {
    const handler = vi.fn(async ({ jobId }: { jobId: string }) => ({ cancelled: jobId === 'job_1' }));
    dispose = createMessageRouter(makeHandlers({ 'queue/cancel': handler }));
    const response = await sendMessage('queue/cancel', { jobId: 'job_1' });
    expect(handler).toHaveBeenCalledWith({ jobId: 'job_1' });
    expect(response.cancelled).toBe(true);
  });

  it('surfaces handler failures as MessageBusError', async () => {
    dispose = createMessageRouter(
      makeHandlers({
        'queue/pause': async () => {
          throw new Error('engine offline');
        },
      }),
    );
    await expect(sendMessage('queue/pause', {})).rejects.toThrow(MessageBusError);
    await expect(sendMessage('queue/pause', {})).rejects.toThrow('engine offline');
  });

  it('rejects messages with no registered handler', async () => {
    dispose = createMessageRouter(makeHandlers({}));
    await expect(sendMessage('queue/resume', {})).rejects.toThrow(/No handler|No response/);
  });

  it('ignores messages that are not bus envelopes', async () => {
    const handler = vi.fn();
    dispose = createMessageRouter(makeHandlers({ 'queue/pause': handler }));
    const raw = (await chrome.runtime.sendMessage({ someOther: 'message' })) as
      | WireResponse<'queue/pause'>
      | undefined;
    expect(raw).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws when chrome.runtime is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    await expect(sendMessage('queue/pause', {})).rejects.toThrow(MessageBusError);
  });
});
