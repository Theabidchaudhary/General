/** Registry mapping provider ids to adapters. The single lookup point used by the queue engine and UI. */

import type { ProviderAdapter, ProviderDescriptor } from './types';
import { ProviderError } from './types';

export class ProviderRegistry {
  #adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`Provider '${adapter.id}' is already registered`);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  /** Throws a normalized ProviderError when the id is unknown, so job failures stay uniform. */
  get(id: string): ProviderAdapter {
    const adapter = this.#adapters.get(id);
    if (!adapter) {
      throw new ProviderError('INVALID_REQUEST', `Unknown provider '${id}'`, { retryable: false });
    }
    return adapter;
  }

  has(id: string): boolean {
    return this.#adapters.has(id);
  }

  list(): ProviderAdapter[] {
    return [...this.#adapters.values()];
  }

  async describeAll(): Promise<ProviderDescriptor[]> {
    return Promise.all(
      this.list().map(async (adapter) => ({
        id: adapter.id,
        name: adapter.name,
        authStatus: await adapter.getAuthStatus(),
        capabilities: await adapter.getCapabilities(),
      })),
    );
  }
}
