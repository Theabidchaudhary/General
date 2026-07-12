import { createId } from '@/utils/id';
import type { NotificationDriver, NotificationOptions } from './driver';

/**
 * A minimal 1x1 transparent PNG, inlined as a data URI. Placeholder until
 * the Packaging milestone adds real branded icon assets — chrome.notifications
 * requires a syntactically valid raster image for `iconUrl`, and a self-contained
 * data URI avoids depending on an extension-relative file that may not exist yet.
 */
const PLACEHOLDER_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
          iconUrl: PLACEHOLDER_ICON,
          title: options.title,
          message: options.message,
        },
        () => resolve(),
      );
    });
  }
}
