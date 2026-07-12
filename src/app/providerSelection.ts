import type { ProviderDescriptor } from '@/providers/types';

/** Resolves the provider to default new jobs to: the user's configured default if it still exists, else the first available. */
export function pickDefaultProvider(
  providers: ProviderDescriptor[],
  preferredId: string | undefined,
): ProviderDescriptor | undefined {
  if (preferredId) {
    const preferred = providers.find((p) => p.id === preferredId);
    if (preferred) return preferred;
  }
  return providers[0];
}
