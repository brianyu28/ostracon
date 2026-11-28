import { useEffect, useRef } from 'react';
import type { EditorChange, EditorExit } from './types';

/**
 * Tracks an editor's pending change and commits it if the editor goes away without an explicit
 * commit or cancel (a click on another cell, scrolling, navigating). The commit is deferred a
 * microtask so React's development remount doesn't count as leaving.
 */
export function useEditorSession(
  /** The change to save if the editor closes without Enter or Esc (null: nothing). */
  change: EditorChange | null,
  onCommit: (change: EditorChange | null, exit: EditorExit) => void,
  onCancel: () => void,
  saveOnClose = true,
) {
  const pending = useRef<EditorChange | null>(null);
  const finished = useRef(false);
  const alive = useRef(true);
  const commitRef = useRef(onCommit);
  const saveRef = useRef(saveOnClose);
  useEffect(() => {
    commitRef.current = onCommit;
    saveRef.current = saveOnClose;
    pending.current = change;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      queueMicrotask(() => {
        if (alive.current || finished.current) return;
        finished.current = true;
        if (pending.current && saveRef.current) commitRef.current(pending.current, null);
      });
    };
  }, []);
  return {
    commit(change: EditorChange | null, exit: EditorExit = null) {
      if (finished.current) return;
      finished.current = true;
      onCommit(change, exit);
    },
    cancel() {
      if (finished.current) return;
      finished.current = true;
      onCancel();
    },
  };
}

/** Exit direction for a key that ends editing, or undefined for other keys. */
export function exitKey(e: { key: string; shiftKey: boolean }): EditorExit | undefined {
  if (e.key === 'Tab') return e.shiftKey ? 'left' : 'right';
  if (e.key === 'Enter') return null;
  return undefined;
}

/**
 * What counts as a click outside an editor's popover. Not Mantine's default `mousedown`: on touch
 * screens that is emulated after the tap ends, once focusing an input may have scrolled the page,
 * so it can land outside a popover the finger was inside and close it.
 */
export const CLICK_OUTSIDE_EVENTS = ['pointerdown'];
