import {
  IconBook,
  IconDeviceGamepad2,
  IconDevices,
  IconMapPin,
  IconMovie,
  IconStack2,
  IconToolsKitchen2,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

/**
 * Curated collection icons, keyed by the `icon` stored on a collection. Keys are Tabler
 * icon names so the set can grow without a schema change (Phase 2 adds the picker).
 */
export const COLLECTION_ICONS: Readonly<Record<string, Icon>> = {
  stack: IconStack2,
  users: IconUsers,
  'tools-kitchen-2': IconToolsKitchen2,
  book: IconBook,
  movie: IconMovie,
  devices: IconDevices,
  'map-pin': IconMapPin,
  'device-gamepad-2': IconDeviceGamepad2,
};
