/**
 * Content script entry point.
 *
 * The foundation ships no static content-script registrations: provider
 * integrations that need in-page access register this script dynamically via
 * chrome.scripting with provider-specific match patterns. Until then this
 * module only announces itself so the wiring can be verified end to end.
 */

const NAMESPACE = 'aiwf-content';

function init(): void {
  // Marker used by integration checks to confirm the script was injected.
  document.documentElement.dataset[toDatasetKey(NAMESPACE)] = 'ready';
}

function toDatasetKey(value: string): string {
  return value.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

init();

export {};
