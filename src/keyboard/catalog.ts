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

export type CommandGroup =
  'General' | 'Navigation' | 'File' | 'Edit' | 'Collections' | 'Views' | 'Records';

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  'General',
  'Navigation',
  'File',
  'Edit',
  'Collections',
  'Views',
  'Records',
];

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
  { id: 'app.search', title: 'Search records', group: 'General', keys: ['mod+p', '/'] },
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
  // Collections
  { id: 'collection.new', title: 'New collection…', group: 'Collections', keys: [] },
  { id: 'collection.addField', title: 'Add field…', group: 'Collections', keys: ['mod+shift+f'] },
  { id: 'collection.settings', title: 'Collection settings…', group: 'Collections', keys: [] },
  // Views
  { id: 'view.prev', title: 'Previous view', group: 'Views', keys: ['['] },
  { id: 'view.next', title: 'Next view', group: 'Views', keys: [']'] },
  { id: 'view.filter', title: 'Filter…', group: 'Views', keys: ['f'] },
  { id: 'view.sort', title: 'Sort…', group: 'Views', keys: ['s'] },
  { id: 'view.group', title: 'Group…', group: 'Views', keys: ['shift+g'] },
  { id: 'view.fields', title: 'Show or hide fields…', group: 'Views', keys: ['shift+f'] },
  {
    id: 'view.search',
    title: 'Search this view',
    group: 'Views',
    keys: ['mod+f'],
    allowInInputs: true,
  },
  { id: 'view.new', title: 'New view', group: 'Views', keys: [] },
  // Records (the table types into cells, so its record shortcuts avoid bare letters)
  { id: 'record.new', title: 'New record', group: 'Records', keys: ['n', 'mod+shift+enter'] },
  {
    id: 'record.togglePanel',
    title: 'Show or hide the record panel',
    group: 'Records',
    keys: ['space'],
  },
  {
    id: 'record.select',
    title: 'Select or unselect the row',
    group: 'Records',
    keys: ['shift+space'],
  },
  { id: 'record.open', title: 'Open record as a page', group: 'Records', keys: ['mod+enter'] },
  { id: 'record.duplicate', title: 'Duplicate records', group: 'Records', keys: ['mod+shift+d'] },
  { id: 'record.delete', title: 'Delete records', group: 'Records', keys: ['mod+backspace'] },
  { id: 'table.fillDown', title: 'Fill down', group: 'Records', keys: ['mod+d'] },
] as const satisfies readonly CommandInfo[];

export type CommandId = (typeof COMMANDS)[number]['id'];

export const COMMANDS_BY_ID: ReadonlyMap<string, CommandInfo> = new Map(
  COMMANDS.map((c) => [c.id, c]),
);
