import { describe, expect, it } from 'vitest';
import type { Job } from '@/types/models';
import { MemoryJobStore } from './jobStore';

function makeJob(id: string): Job {
  const now = Date.now();
  return {
    id,
    request: { providerId: 'mock', kind: 'image', prompt: 'test', params: {} },
    state: 'pending',
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
  };
}

describe('MemoryJobStore', () => {
  it('round-trips jobs', async () => {
    const store = new MemoryJobStore();
    await store.save(makeJob('a'));
    const loaded = await store.get('a');
    expect(loaded?.id).toBe('a');
    expect(await store.getAll()).toHaveLength(1);
  });

  it('isolates persisted state from caller mutation', async () => {
    const store = new MemoryJobStore();
    const job = makeJob('a');
    await store.save(job);
    job.state = 'failed';
    expect((await store.get('a'))?.state).toBe('pending');
  });

  it('deletes and clears', async () => {
    const store = new MemoryJobStore();
    await store.save(makeJob('a'));
    await store.save(makeJob('b'));
    await store.delete('a');
    expect(await store.get('a')).toBeUndefined();
    await store.clear();
    expect(await store.getAll()).toHaveLength(0);
  });
});
