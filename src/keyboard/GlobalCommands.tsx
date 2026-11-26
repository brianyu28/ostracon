import { useLocation } from 'wouter';
import { collectionPath } from '@/app/routes';
import { useDiscardGuard } from '@/app/file/useDiscardGuard';
import { docStore } from '@/store/docStore';
import { prefsStore } from '@/store/prefsStore';
import { session, sessionStore } from '@/store/sessionStore';
import { uiStore } from '@/store/uiStore';
import { useCommandHandlers } from './useCommandHandlers';
import type { CommandId } from './catalog';
import { installKeyboard, type Handler } from './registry';
import { useEffect } from 'react';

const hasDoc = () => docStore.getState().doc !== null;

/** The open document's collection at a 1-based sidebar position. */
function collectionAt(position: number) {
  const collections = Object.values(docStore.getState().doc?.collections ?? {});
  return collections.sort((a, b) => a.order - b.order)[position - 1];
}

/** `g 1` … `g 9`: jump to a collection by its position in the sidebar. */
function collectionHandlers(navigate: (path: string) => void) {
  const handlers: Partial<Record<CommandId, Handler>> = {};
  for (let n = 1; n <= 9; n++) {
    handlers[`nav.collection${n}` as CommandId] = {
      run: () => {
        const collection = collectionAt(n);
        if (collection) navigate(collectionPath(collection.id));
      },
      enabled: () => collectionAt(n) !== undefined,
    };
  }
  return handlers;
}

/** App-wide command handlers (navigation, file, undo/redo, palette, help). */
export function GlobalCommands() {
  const [, navigate] = useLocation();
  const [guard, discardModal] = useDiscardGuard();

  useEffect(() => installKeyboard(), []);

  const go = (path: string) => ({
    run: () => {
      navigate(path);
    },
  });

  useCommandHandlers({
    'app.palette': {
      run: () => {
        uiStore.setState({ paletteOpen: true, helpOpen: false });
      },
    },
    'app.help': {
      run: () => {
        uiStore.setState({ helpOpen: true, paletteOpen: false });
      },
    },
    'app.toggleSidebar': {
      run: () => {
        const { sidebarCollapsed, setPref } = prefsStore.getState();
        setPref('sidebarCollapsed', !sidebarCollapsed);
      },
    },
    'nav.home': go('/'),
    'nav.settings': go('/settings'),
    ...collectionHandlers(navigate),
    'file.save': { run: () => void session.save(), enabled: hasDoc },
    'file.saveAs': { run: () => void session.save({ saveAs: true }), enabled: hasDoc },
    'file.open': {
      run: () => {
        guard(session.open);
      },
    },
    'file.new': {
      run: () => {
        guard(() => session.newDocument('empty'));
      },
    },
    'file.close': {
      run: () => {
        guard(session.close);
      },
      enabled: () => sessionStore.getState().status === 'ready',
    },
    'edit.undo': {
      run: () => {
        docStore.getState().undo();
      },
      enabled: () => docStore.getState().undoLabel !== null,
    },
    'edit.redo': {
      run: () => {
        docStore.getState().redo();
      },
      enabled: () => docStore.getState().redoLabel !== null,
    },
  });

  return discardModal;
}
