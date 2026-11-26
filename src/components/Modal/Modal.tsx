import { Modal as MantineModal, type ModalProps } from '@mantine/core';
import { useEffect, useId, useSyncExternalStore } from 'react';

// Ids of the open dialogs, in the order they opened. Mantine closes every open modal on
// Escape (each listens on window), so only the most recently opened one may react to it.
let stack: readonly string[] = [];
const listeners = new Set<() => void>();

function setStack(next: readonly string[]): void {
  stack = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The app's dialog: Mantine's Modal, except that Escape closes only the topmost open dialog
 * (a field editor opened from collection settings closes alone). Use it instead of
 * importing `Modal` from Mantine.
 */
export function Modal({ opened, closeOnEscape = true, ...props }: ModalProps) {
  const id = useId();
  const isTop = useSyncExternalStore(subscribe, () => stack[stack.length - 1] === id);
  useEffect(() => {
    if (!opened) return;
    setStack([...stack.filter((s) => s !== id), id]);
    return () => {
      setStack(stack.filter((s) => s !== id));
    };
  }, [opened, id]);
  return <MantineModal opened={opened} closeOnEscape={closeOnEscape && isTop} {...props} />;
}
