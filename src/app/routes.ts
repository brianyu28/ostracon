import { IconHome, IconSettings, type Icon } from '@tabler/icons-react';
import { lazy, type ComponentType } from 'react';

// Screens load on demand, keeping the initial bundle small.
const HomePage = lazy(() =>
  import('@/features/home/HomePage').then((m) => ({ default: m.HomePage })),
);
const CollectionPage = lazy(() =>
  import('@/features/collection/CollectionPage').then((m) => ({ default: m.CollectionPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

export interface AppRoute {
  path: string;
  title: string;
  icon: Icon;
  component: ComponentType;
  /** Shown in the phone bottom navigation (others are reachable from "More"). */
  primary?: boolean;
  /** Usable without an open document (default: requires one). */
  standalone?: boolean;
  /** Route pattern when it differs from `path` (e.g. to accept sub-paths). */
  match?: string;
  /** Left out of the sidebar and bottom nav (reached some other way). */
  hidden?: boolean;
}

/** Path of a collection (and optionally one of its views). */
export function collectionPath(collectionId: string, viewId?: string): string {
  return viewId ? `/c/${collectionId}/${viewId}` : `/c/${collectionId}`;
}

/** Single source of truth for navigation: drives the router, sidebar and bottom nav. */
export const routes: readonly AppRoute[] = [
  { path: '/', title: 'Home', icon: IconHome, component: HomePage, primary: true },
  {
    path: '/c',
    title: 'Collection',
    icon: IconHome,
    component: CollectionPage,
    match: '/c/:collectionId/:viewId?',
    hidden: true,
  },
  {
    path: '/settings',
    title: 'Settings',
    icon: IconSettings,
    component: SettingsPage,
    standalone: true,
    primary: true,
    match: '/settings/:section?',
  },
];
