import type { NotificationDriver, NotificationOptions } from './driver';

/** Records every notification for assertions, instead of showing anything. */
export class MockNotificationDriver implements NotificationDriver {
  readonly calls: NotificationOptions[] = [];

  async notify(options: NotificationOptions): Promise<void> {
    this.calls.push(options);
  }
}
