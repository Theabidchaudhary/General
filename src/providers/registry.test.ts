import { describe, expect, it } from 'vitest';
import { MockProvider } from './mock/mockProvider';
import { ProviderRegistry } from './registry';
import { ProviderError } from './types';

describe('ProviderRegistry', () => {
  it('registers and resolves providers', () => {
    const registry = new ProviderRegistry();
    const provider = new MockProvider();
    registry.register(provider);
    expect(registry.get('mock')).toBe(provider);
    expect(registry.has('mock')).toBe(true);
    expect(registry.list()).toHaveLength(1);
  });

  it('rejects duplicate registration', () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider());
    expect(() => registry.register(new MockProvider())).toThrow(/already registered/);
  });

  it('throws a normalized ProviderError for unknown ids', () => {
    const registry = new ProviderRegistry();
    try {
      registry.get('nope');
      expect.fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe('INVALID_REQUEST');
      expect((error as ProviderError).retryable).toBe(false);
    }
  });

  it('describes providers with auth status and capabilities', async () => {
    const registry = new ProviderRegistry();
    registry.register(new MockProvider());
    const [descriptor] = await registry.describeAll();
    expect(descriptor?.id).toBe('mock');
    expect(descriptor?.authStatus).toBe('authenticated');
    expect(descriptor?.capabilities.length).toBeGreaterThan(0);
  });
});
