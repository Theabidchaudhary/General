import { describe, expect, it } from 'vitest';
import { MockProvider } from '@/providers/mock/mockProvider';
import { ProviderRegistry } from '@/providers/registry';
import { MemoryJobStore } from '@/services/storage/jobStore';
import { MissingVariableError } from '@/prompts/variables';
import { BatchEngine, BatchValidationError, MAX_BATCH_SIZE } from './batch';
import { QueueEngine } from './engine';

function makeBatchEngine() {
  const registry = new ProviderRegistry();
  registry.register(new MockProvider());
  const queue = new QueueEngine({
    store: new MemoryJobStore(),
    registry,
    maxConcurrent: 4,
    // Keep batch jobs pending so tests can assert on the enqueue snapshot
    // without racing the (fast) mock provider to completion.
  });
  queue.pause();
  return { batch: new BatchEngine(queue), queue };
}

describe('BatchEngine', () => {
  it('enqueues one job per cartesian-product combination', async () => {
    const { batch } = makeBatchEngine();
    const result = await batch.submit({
      providerId: 'mock',
      kind: 'image',
      body: '{{subject}} in {{style}} style',
      matrix: { subject: ['fox', 'owl'], style: ['oil', 'ink'] },
    });
    expect(result.jobs).toHaveLength(4);
    expect(result.jobs.map((j) => j.request.prompt).sort()).toEqual(
      ['fox in ink style', 'fox in oil style', 'owl in ink style', 'owl in oil style'].sort(),
    );
  });

  it('tags every job in the batch with the same batchId and templateId', async () => {
    const { batch } = makeBatchEngine();
    const result = await batch.submit({
      providerId: 'mock',
      kind: 'image',
      body: '{{subject}}',
      matrix: { subject: ['a', 'b', 'c'] },
      templateId: 'tpl_123',
    });
    const batchIds = new Set(result.jobs.map((j) => j.request.batchId));
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toBe(result.batchId);
    expect(result.jobs.every((j) => j.request.templateId === 'tpl_123')).toBe(true);
  });

  it('merges fixedValues with matrix combinations', async () => {
    const { batch } = makeBatchEngine();
    const result = await batch.submit({
      providerId: 'mock',
      kind: 'video',
      body: '{{subject}} in {{mood}} mood',
      matrix: { subject: ['fox', 'owl'] },
      fixedValues: { mood: 'calm' },
    });
    expect(result.jobs.map((j) => j.request.prompt)).toEqual([
      'fox in calm mood',
      'owl in calm mood',
    ]);
  });

  it('produces a single job for an empty matrix', async () => {
    const { batch } = makeBatchEngine();
    const result = await batch.submit({
      providerId: 'mock',
      kind: 'image',
      body: 'a static prompt',
      matrix: {},
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.request.prompt).toBe('a static prompt');
  });

  it('rejects a variable with no options instead of silently producing zero jobs', async () => {
    const { batch } = makeBatchEngine();
    await expect(
      batch.submit({
        providerId: 'mock',
        kind: 'image',
        body: '{{subject}}',
        matrix: { subject: [] },
      }),
    ).rejects.toBeInstanceOf(BatchValidationError);
  });

  it('rejects batches exceeding MAX_BATCH_SIZE without expanding them', async () => {
    const { batch, queue } = makeBatchEngine();
    const bigOption = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `v${i}`);
    await expect(
      batch.submit({
        providerId: 'mock',
        kind: 'image',
        body: '{{x}}',
        matrix: { x: bigOption },
      }),
    ).rejects.toBeInstanceOf(BatchValidationError);
    expect(queue.listJobs()).toHaveLength(0);
  });

  it('propagates MissingVariableError for variables absent from both matrix and fixedValues', async () => {
    const { batch } = makeBatchEngine();
    await expect(
      batch.submit({
        providerId: 'mock',
        kind: 'image',
        body: '{{subject}} {{style}}',
        matrix: { subject: ['fox'] },
      }),
    ).rejects.toBeInstanceOf(MissingVariableError);
  });

  it('passes through priority and maxAttempts to every enqueued job', async () => {
    const { batch } = makeBatchEngine();
    const result = await batch.submit({
      providerId: 'mock',
      kind: 'image',
      body: '{{x}}',
      matrix: { x: ['a', 'b'] },
      priority: 5,
      maxAttempts: 7,
    });
    expect(result.jobs.every((j) => j.priority === 5 && j.maxAttempts === 7)).toBe(true);
  });
});
