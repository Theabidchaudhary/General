/**
 * Message bus implementation over chrome.runtime messaging.
 *
 * The background worker registers one handler per message type via
 * createMessageRouter(); UI contexts call sendMessage(). Both sides share
 * the MessageMap contract for end-to-end type safety.
 */

import {
  isEnvelope,
  type Envelope,
  type MessageMap,
  type MessageType,
  type WireResponse,
} from './messages';

export type HandlerMap = {
  [K in MessageType]: (payload: MessageMap[K]['request']) => Promise<MessageMap[K]['response']>;
};

export class MessageBusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageBusError';
  }
}

function runtimeAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;
}

/** Sends a typed request to the background worker and awaits the response. */
export async function sendMessage<K extends MessageType>(
  type: K,
  payload: MessageMap[K]['request'],
): Promise<MessageMap[K]['response']> {
  if (!runtimeAvailable()) {
    throw new MessageBusError('chrome.runtime messaging is not available in this context');
  }
  const envelope: Envelope<K> = { channel: 'aiwf', type, payload };
  const response = (await chrome.runtime.sendMessage(envelope)) as WireResponse<K> | undefined;
  if (!response) {
    throw new MessageBusError(`No response for message '${type}'`);
  }
  if (!response.ok) {
    throw new MessageBusError(response.error);
  }
  return response.data;
}

/**
 * Registers the background-side router. Returns a disposer that removes the
 * listener (used by tests).
 */
export function createMessageRouter(handlers: HandlerMap): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: WireResponse<MessageType>) => void,
  ): boolean | undefined => {
    if (!isEnvelope(message)) return undefined;
    const handler = handlers[message.type];
    if (!handler) {
      sendResponse({ ok: false, error: `No handler for message '${message.type}'` });
      return undefined;
    }
    handler(message.payload as never)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    // Keep the response channel open for the async handler.
    return true;
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
