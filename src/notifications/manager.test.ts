import { describe, expect, it } from 'vitest';
import type { QueueEvents } from '@/queue/engine';
import type { Job } from '@/types/models';
import { Emitter } from '@/utils/emitter';
import { createId } from '@/utils/id';
import { NotificationManager, type JobEventSource } from './manager';
import { MockNotificationDriver } from './mockDriver';

class FakeQueue implements JobEventSource {
  readonly events = new Emitter<QueueEvents>();
  emit(job: Job): void {
    this.events.emit('job-updated', job);
  }
}

function makeJob(overrides: Partial<Job> = {}): Job {
  const now = Date.now();
  return {
    id: createId('job'),
    request: { providerId: 'mock', kind: 'image', prompt: 'a red fox', params: {} },
    state: 'completed',
    priority: 0,
    attempts: 1,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('NotificationManager', () => {
  it('does not notify when disabled', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    const manager = new NotificationManager(queue, driver, false);
    queue.emit(makeJob());
    expect(driver.calls).toHaveLength(0);
    expect(manager.enabled).toBe(false);
  });

  it('notifies on job completion when enabled', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    new NotificationManager(queue, driver, true);
    queue.emit(makeJob({ state: 'completed' }));
    expect(driver.calls).toHaveLength(1);
    expect(driver.calls[0]?.title).toBe('Job completed');
    expect(driver.calls[0]?.message).toBe('a red fox');
  });

  it('notifies on job failure when enabled', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    new NotificationManager(queue, driver, true);
    queue.emit(makeJob({ state: 'failed' }));
    expect(driver.calls).toHaveLength(1);
    expect(driver.calls[0]?.title).toBe('Job failed');
  });

  it('does not notify again when a completed job later becomes downloaded', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    new NotificationManager(queue, driver, true);
    const job = makeJob({ state: 'completed' });
    queue.emit(job);
    queue.emit({ ...job, state: 'downloaded' });
    expect(driver.calls).toHaveLength(1);
  });

  it('ignores non-terminal state updates', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    new NotificationManager(queue, driver, true);
    queue.emit(makeJob({ state: 'running' }));
    expect(driver.calls).toHaveLength(0);
  });

  it('truncates long prompts', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    new NotificationManager(queue, driver, true);
    queue.emit(makeJob({ request: { providerId: 'mock', kind: 'image', prompt: 'x'.repeat(200), params: {} } }));
    expect(driver.calls[0]?.message.length).toBeLessThanOrEqual(80);
    expect(driver.calls[0]?.message.endsWith('…')).toBe(true);
  });

  it('setEnabled toggles subscription on and off', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    const manager = new NotificationManager(queue, driver, false);

    manager.setEnabled(true);
    queue.emit(makeJob({ id: 'job_a' }));
    expect(driver.calls).toHaveLength(1);

    manager.setEnabled(false);
    queue.emit(makeJob({ id: 'job_b' }));
    expect(driver.calls).toHaveLength(1);
  });

  it('dispose stops notifications', () => {
    const queue = new FakeQueue();
    const driver = new MockNotificationDriver();
    const manager = new NotificationManager(queue, driver, true);
    manager.dispose();
    queue.emit(makeJob());
    expect(driver.calls).toHaveLength(0);
  });
});
