import { useEffect } from 'react';
import { VIEWS, type ViewId } from './store';

/**
 * Alt+1..7 switches between the seven views, matching their nav order.
 * Ignored while a modifier other than Alt is held, and while focus is in a
 * text field where Alt+digit could plausibly be part of composing input.
 */
export function useKeyboardShortcuts(setActiveView: (view: ViewId) => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = Number(event.key) - 1;
      const view = VIEWS[index];
      if (Number.isInteger(index) && view) {
        event.preventDefault();
        setActiveView(view.id);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setActiveView]);
}
