import { describe, expect, it, vi } from 'vitest';
import { Emitter } from './emitter';

interface TestEvents extends Record<string, unknown> {
  ping: number;
  note: string;
}

describe('Emitter', () => {
  it('delivers payloads to subscribed listeners', () => {
    const emitter = new Emitter<TestEvents>();
    const listener = vi.fn();
    emitter.on('ping', listener);
    emitter.emit('ping', 42);
    expect(listener).toHaveBeenCalledWith(42);
  });

  it('does not cross-deliver between events', () => {
    const emitter = new Emitter<TestEvents>();
    const listener = vi.fn();
    emitter.on('note', listener);
    emitter.emit('ping', 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribes via the returned disposer', () => {
    const emitter = new Emitter<TestEvents>();
    const listener = vi.fn();
    const off = emitter.on('ping', listener);
    off();
    emitter.emit('ping', 7);
    expect(listener).not.toHaveBeenCalled();
  });

  it('tolerates listeners unsubscribing during emit', () => {
    const emitter = new Emitter<TestEvents>();
    const second = vi.fn();
    const first = vi.fn(() => emitter.off('ping', second));
    emitter.on('ping', first);
    emitter.on('ping', second);
    emitter.emit('ping', 1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});
