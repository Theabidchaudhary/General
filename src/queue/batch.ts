/**
 * Batch engine: fans a prompt template out across a variable-option matrix
 * into multiple queued jobs.
 *
 * This is a thin orchestration layer over expandMatrix() (variable
 * expansion) and QueueEngine (job scheduling) — it owns none of the
 * enqueue/retry mechanics itself, only the fan-out and a sanity cap on
 * batch size so a mistyped matrix can't silently create thousands of jobs.
 */

import type { JobRequest, MediaKind, Job } from '@/types/models';
import { expandMatrix } from '@/prompts/variables';
import { createId } from '@/utils/id';
import type { QueueEngine } from './engine';

/** Hard ceiling on jobs created by a single batch submission. */
export const MAX_BATCH_SIZE = 50;

export class BatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BatchValidationError';
  }
}

export interface BatchInput {
  providerId: string;
  kind: MediaKind;
  /** Template body, e.g. "a {{subject}} in {{style}} style". */
  body: string;
  /** Variable name -> option list; the batch is the cartesian product of these. */
  matrix: Record<string, string[]>;
  /** Values for variables referenced in body but not present in matrix. */
  fixedValues?: Record<string, string>;
  params?: JobRequest['params'];
  templateId?: string;
  priority?: number;
  maxAttempts?: number;
}

export interface BatchResult {
  batchId: string;
  jobs: Job[];
}

function combinationCount(matrix: Record<string, string[]>): number {
  return Object.values(matrix).reduce((total, options) => total * options.length, 1);
}

export class BatchEngine {
  #queue: QueueEngine;

  constructor(queue: QueueEngine) {
    this.#queue = queue;
  }

  /** Expands the template across the matrix and enqueues one job per combination, in order. */
  async submit(input: BatchInput): Promise<BatchResult> {
    for (const [name, options] of Object.entries(input.matrix)) {
      if (options.length === 0) {
        throw new BatchValidationError(`Variable '${name}' has no options`);
      }
    }

    const total = combinationCount(input.matrix);
    if (total > MAX_BATCH_SIZE) {
      throw new BatchValidationError(
        `Batch would create ${total} jobs, exceeding the limit of ${MAX_BATCH_SIZE}`,
      );
    }

    // Propagates MissingVariableError (via expandTemplate) if body references
    // a variable that's in neither matrix nor fixedValues.
    const prompts = expandMatrix(input.body, input.matrix, input.fixedValues ?? {});

    const batchId = createId('batch');
    const jobs: Job[] = [];
    for (const prompt of prompts) {
      const request: JobRequest = {
        providerId: input.providerId,
        kind: input.kind,
        prompt,
        params: input.params ?? {},
        batchId,
        ...(input.templateId ? { templateId: input.templateId } : {}),
      };
      const enqueueOptions = {
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
      };
      const job = await this.#queue.enqueue(request, enqueueOptions);
      jobs.push(job);
    }

    return { batchId, jobs };
  }
}
