import { createId } from '@/utils/id';
import type { NotificationDriver, NotificationOptions } from './driver';

export class ChromeNotificationDriver implements NotificationDriver {
  async notify(options: NotificationOptions): Promise<void> {
    // chrome.notifications.create is callback-only in this API surface (no
    // Promise overload, unlike chrome.alarms.create/chrome.downloads.download);
    // wrap it so the driver interface stays async like every other driver.
    await new Promise<void>((resolve) => {
      chrome.notifications.create(
        createId('notif'),
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: options.title,
          message: options.message,
        },
        () => resolve(),
      );
    });
  }
}
