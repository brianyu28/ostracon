/**
 * Every keyboard-invocable command, with its default bindings. Screens attach handlers
 * by id (see `useCommandHandlers`); the palette, help overlay and Settings → Keyboard all
 * read this catalog, so a command only needs to be declared here once.
 */
export interface CommandInfo {
  id: string;
  title: string;
  group: CommandGroup;
  /** Default bindings (see keys.ts for syntax). */
  keys: readonly string[];
  /** Also fires while typing in a text field. */
  allowInInputs?: boolean;
}

export type CommandGroup = 'General' | 'Navigation' | 'File' | 'Edit';

export const COMMAND_GROUPS: readonly CommandGroup[] = ['General', 'Navigation', 'File', 'Edit'];

export const COMMANDS = [
  // General
  {
    id: 'app.palette',
    title: 'Command palette',
    group: 'General',
    keys: ['mod+k'],
    allowInInputs: true,
  },
  { id: 'app.help', title: 'Keyboard shortcuts', group: 'General', keys: ['?'] },
  { id: 'app.toggleSidebar', title: 'Toggle sidebar', group: 'General', keys: ['mod+\\'] },
  // Navigation
  { id: 'nav.home', title: 'Go to Home', group: 'Navigation', keys: ['g h'] },
  { id: 'nav.settings', title: 'Go to Settings', group: 'Navigation', keys: ['g s', 'g ,'] },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => ({
    id: `nav.collection${n}` as const,
    title: `Go to collection ${n}`,
    group: 'Navigation' as const,
    keys: [`g ${n}`],
  })),
  // File
  { id: 'file.save', title: 'Save', group: 'File', keys: ['mod+s'], allowInInputs: true },
  {
    id: 'file.saveAs',
    title: 'Save as…',
    group: 'File',
    keys: ['mod+shift+s'],
    allowInInputs: true,
  },
  { id: 'file.open', title: 'Open file…', group: 'File', keys: ['mod+o'] },
  { id: 'file.new', title: 'New file', group: 'File', keys: [] },
  { id: 'file.close', title: 'Close file', group: 'File', keys: [] },
  // Edit
  { id: 'edit.undo', title: 'Undo', group: 'Edit', keys: ['mod+z'] },
  { id: 'edit.redo', title: 'Redo', group: 'Edit', keys: ['mod+shift+z', 'mod+y'] },
] as const satisfies readonly CommandInfo[];

export type CommandId = (typeof COMMANDS)[number]['id'];

export const COMMANDS_BY_ID: ReadonlyMap<string, CommandInfo> = new Map(
  COMMANDS.map((c) => [c.id, c]),
);
