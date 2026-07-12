/**
 * Notification driver abstraction — same pattern as the provider/download
 * driver interfaces: the manager depends only on this, never on
 * chrome.notifications directly.
 */

export interface NotificationOptions {
  title: string;
  message: string;
}

export interface NotificationDriver {
  notify(options: NotificationOptions): Promise<void>;
}
