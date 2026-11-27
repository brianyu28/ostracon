/**
 * The template catalog. Adding a template is adding an entry here: the gallery, preview and
 * creation all read it. Bump a template's `version` when its schema changes.
 */
import {
  options,
  THIS_YEAR,
  where,
  type Template,
  type TemplateField,
  type TemplateLinkField,
  type TemplateValueField,
} from './model';

type ValueType = TemplateValueField['type'];

const f = (
  key: string,
  name: string,
  type: ValueType,
  config?: Record<string, unknown>,
): TemplateValueField => ({ key, name, type, ...(config ? { config } : {}) });

const formula = (key: string, name: string, expression: string): TemplateField => ({
  key,
  name,
  type: 'formula',
  expression,
});

const link = (
  key: string,
  name: string,
  target: TemplateLinkField['target'],
  extra: Partial<Omit<TemplateLinkField, 'key' | 'name' | 'target' | 'type'>> = {},
): TemplateLinkField => ({ key, name, type: 'link', target, multiple: true, ...extra });

const PEOPLE = { template: 'people' } as const;
const CITY = { parts: ['city', 'region', 'country'] };
const PLACE = { parts: ['name', 'address', 'city', 'region', 'country'] };
const STARS = { max: 5 };
const CURRENCY = { style: 'currency', decimals: 2 };
const PARTIAL = { partial: true };
const notes = (): TemplateField => f('notes', 'Notes', 'richText');
const title = (name = 'Name'): TemplateField => f('name', name, 'text');

/** Every template, in gallery order. */
export const TEMPLATES: readonly Template[] = [
  {
    key: 'people',
    name: 'People',
    description: 'Friends and family',
    keywords: 'friends family birthdays',
    version: 1,
    collection: {
      name: 'People',
      icon: 'users',
      color: 'blue',
      primary: 'name',
      fields: [
        title(),
        f(
          'relationship',
          'Relationship',
          'multiSelect',
          options('Family', 'Friend', 'Work', 'Neighbor'),
        ),
        f('birthday', 'Birthday', 'date', PARTIAL),
        formula(
          'age',
          'Age',
          'IF(ISBLANK({Birthday}), BLANK(), DATEDIFF({Birthday}, TODAY(), "years"))',
        ),
        f('location', 'Lives in', 'location', CITY),
        notes(),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'name', dir: 'asc' }] },
        { name: 'By relationship', group: { field: 'relationship', dir: 'asc' } },
        {
          name: 'Birthdays',
          sorts: [{ field: 'birthday', dir: 'asc' }],
          filter: where('birthday', 'isNotEmpty'),
        },
      ],
    },
  },
  {
    key: 'restaurants',
    name: 'Restaurants',
    description: 'Where you ate',
    keywords: 'food dining eat cafes visits meals',
    version: 1,
    collection: {
      name: 'Restaurants',
      icon: 'tools-kitchen-2',
      color: 'orange',
      primary: 'name',
      fields: [
        title('Restaurant'),
        f('date', 'Date', 'date'),
        link('with', 'With', PEOPLE, { backlink: { name: 'Meals' } }),
        f('cuisine', 'Cuisine', 'multiSelect', options()),
        f('location', 'Location', 'location', CITY),
        f('rating', 'Rating', 'rating', STARS),
        notes(),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'date', dir: 'desc' }] },
        {
          name: 'This year',
          filter: where('date', 'within', THIS_YEAR),
          sorts: [{ field: 'date', dir: 'desc' }],
        },
        {
          name: 'Favorites',
          filter: where('rating', 'gte', 4),
          sorts: [{ field: 'rating', dir: 'desc' }],
        },
        { name: 'By restaurant', group: { field: 'name', dir: 'asc' } },
        { name: 'Calendar', layout: 'calendar', calendar: { field: 'date' } },
      ],
    },
  },
  {
    key: 'activities',
    name: 'Activities',
    description: 'Things you did',
    keywords: 'events outings log diary',
    version: 1,
    collection: {
      name: 'Activities',
      icon: 'run',
      color: 'green',
      primary: 'name',
      fields: [
        title('What'),
        f('type', 'Type', 'singleSelect', options()),
        f('dates', 'Date', 'dateRange'),
        link('with', 'With', PEOPLE, { backlink: { name: 'Activities' } }),
        f('location', 'Location', 'location', PLACE),
        notes(),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'dates', dir: 'desc' }] },
        {
          name: 'This year',
          filter: where('dates', 'within', THIS_YEAR),
          sorts: [{ field: 'dates', dir: 'desc' }],
        },
        { name: 'By type', group: { field: 'type', dir: 'asc' } },
        { name: 'Calendar', layout: 'calendar', calendar: { field: 'dates', color: 'type' } },
      ],
    },
  },
  {
    key: 'books',
    name: 'Books',
    description: 'What you’ve read',
    keywords: 'reading library novels',
    version: 1,
    collection: {
      name: 'Books',
      icon: 'books',
      color: 'purple',
      primary: 'name',
      fields: [
        title('Title'),
        f('author', 'Author', 'text'),
        f(
          'status',
          'Status',
          'singleSelect',
          options(
            ['To read', 'gray'],
            ['Reading', 'blue'],
            ['Read', 'green'],
            ['Abandoned', 'red'],
          ),
        ),
        f('started', 'Started', 'date', PARTIAL),
        f('finished', 'Finished', 'date', PARTIAL),
        formula('days', 'Days to read', 'DATEDIFF({Started}, {Finished})'),
        f('rating', 'Rating', 'rating', STARS),
        f('format', 'Format', 'singleSelect', options('Print', 'E-book', 'Audiobook')),
        f('pages', 'Pages', 'number', { style: 'plain' }),
        f(
          'genre',
          'Genre',
          'multiSelect',
          options('Fiction', 'Nonfiction', 'Mystery', 'Science', 'History'),
        ),
        notes(),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'finished', dir: 'desc' }] },
        { name: 'Reading list', filter: where('status', 'isAnyOf', ['To read']) },
        { name: 'By status', group: { field: 'status', dir: 'asc' } },
        {
          name: 'Read this year',
          filter: where('finished', 'within', THIS_YEAR),
          summaries: { pages: 'sum' },
        },
        {
          name: 'Board',
          layout: 'board',
          board: { field: 'status', cardFields: ['author', 'rating'] },
        },
      ],
    },
    log: {
      label: 'reads',
      parentFields: [formula('count', 'Times read', 'COUNT_LINKS({Reads})')],
      collection: {
        name: 'Reads',
        icon: 'notebook',
        color: 'purple',
        primary: 'name',
        fields: [
          title('Read'),
          link('book', 'Book', { parent: true }, { multiple: false, backlink: { name: 'Reads' } }),
          f('dates', 'Dates', 'dateRange', PARTIAL),
          f('format', 'Format', 'singleSelect', options('Print', 'E-book', 'Audiobook')),
          f('rating', 'Rating', 'rating', STARS),
          notes(),
        ],
        views: [{ name: 'All', sorts: [{ field: 'dates', dir: 'desc' }] }],
      },
    },
  },
  {
    key: 'movies',
    name: 'Movies',
    description: 'Films you’ve watched and want to see',
    keywords: 'films cinema watchlist',
    version: 1,
    collection: {
      name: 'Movies',
      icon: 'movie',
      color: 'red',
      primary: 'name',
      fields: [
        title('Title'),
        f('year', 'Year', 'number', { style: 'plain' }),
        f('director', 'Director', 'text'),
        f(
          'genre',
          'Genre',
          'multiSelect',
          options('Drama', 'Comedy', 'Action', 'Documentary', 'Animation'),
        ),
        f('watched', 'Watched on', 'date', PARTIAL),
        f('where', 'Where', 'singleSelect', options('Theater', 'Streaming', 'TV', 'Flight')),
        link('with', 'With', PEOPLE),
        f('rating', 'Rating', 'rating', STARS),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'watched', dir: 'desc' }] },
        { name: 'Watchlist', filter: where('watched', 'isEmpty') },
        {
          name: 'Favorites',
          filter: where('rating', 'gte', 4),
          sorts: [{ field: 'rating', dir: 'desc' }],
        },
      ],
    },
    log: {
      label: 'watches',
      parentFields: [formula('count', 'Times watched', 'COUNT_LINKS({Watches})')],
      collection: {
        name: 'Watches',
        icon: 'player-play',
        color: 'red',
        primary: 'name',
        fields: [
          title('Watch'),
          link(
            'movie',
            'Movie',
            { parent: true },
            { multiple: false, backlink: { name: 'Watches' } },
          ),
          f('date', 'Date', 'date'),
          f('where', 'Where', 'singleSelect', options('Theater', 'Streaming', 'TV', 'Flight')),
          link('with', 'With', PEOPLE),
          f('rating', 'Rating', 'rating', STARS),
        ],
        views: [{ name: 'All', sorts: [{ field: 'date', dir: 'desc' }] }],
      },
    },
  },
  {
    key: 'tv',
    name: 'TV shows',
    description: 'Series you follow and have finished',
    keywords: 'television series shows seasons streaming',
    version: 1,
    collection: {
      name: 'TV shows',
      icon: 'device-tv',
      color: 'teal',
      primary: 'name',
      fields: [
        title('Show'),
        f('season', 'Season', 'number', { style: 'plain' }),
        f('network', 'Network or service', 'text'),
        f(
          'status',
          'Status',
          'singleSelect',
          options(
            ['Want to watch', 'gray'],
            ['Watching', 'blue'],
            ['Finished', 'green'],
            ['Stopped', 'red'],
          ),
        ),
        f('started', 'Started', 'date', PARTIAL),
        f('finished', 'Finished', 'date', PARTIAL),
        f('rating', 'Rating', 'rating', STARS),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'started', dir: 'desc' }] },
        {
          name: 'By show',
          group: { field: 'name', dir: 'asc' },
          sorts: [{ field: 'season', dir: 'asc' }],
        },
        { name: 'By status', group: { field: 'status', dir: 'asc' } },
        {
          name: 'Board',
          layout: 'board',
          board: { field: 'status', cardFields: ['season', 'network'] },
        },
      ],
    },
  },
  {
    key: 'trips',
    name: 'Trips',
    description: 'Where you went',
    keywords: 'travel vacations holidays',
    version: 1,
    collection: {
      name: 'Trips',
      icon: 'plane',
      color: 'blue',
      primary: 'name',
      fields: [
        title(),
        f('dates', 'Dates', 'dateRange', PARTIAL),
        f('destination', 'Destination', 'location', CITY),
        link('with', 'With', PEOPLE, { backlink: { name: 'Trips' } }),
        f('purpose', 'Purpose', 'singleSelect', options('Vacation', 'Work', 'Family', 'Event')),
        notes(),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'dates', dir: 'desc' }] },
        { name: 'By year', group: { field: 'dates', dir: 'desc', dateBucket: 'year' } },
        { name: 'Calendar', layout: 'calendar', calendar: { field: 'dates', color: 'purpose' } },
      ],
    },
  },
  {
    key: 'gifts',
    name: 'Gifts',
    description: 'Gifts given and received',
    keywords: 'presents birthdays holidays ideas',
    version: 1,
    collection: {
      name: 'Gifts',
      icon: 'gift',
      color: 'red',
      primary: 'name',
      fields: [
        title('Gift'),
        f(
          'direction',
          'Direction',
          'singleSelect',
          options(['Given', 'blue'], ['Received', 'green']),
        ),
        link('person', 'Person', PEOPLE, { backlink: { name: 'Gifts' } }),
        f(
          'occasion',
          'Occasion',
          'singleSelect',
          options('Birthday', 'Holiday', 'Wedding', 'Thank you'),
        ),
        f('date', 'Date', 'date', PARTIAL),
        f('price', 'Price', 'number', CURRENCY),
        f(
          'status',
          'Status',
          'singleSelect',
          options(['Idea', 'gray'], ['Bought', 'yellow'], ['Done', 'green']),
        ),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'date', dir: 'desc' }] },
        { name: 'Ideas', filter: where('status', 'isAnyOf', ['Idea']) },
        {
          name: 'Board',
          layout: 'board',
          board: { field: 'status', cardFields: ['person', 'occasion'] },
        },
      ],
    },
  },
  {
    key: 'recipes',
    name: 'Recipes',
    description: 'Dishes you’ve cooked',
    keywords: 'cooking food kitchen',
    version: 1,
    collection: {
      name: 'Recipes',
      icon: 'chef-hat',
      color: 'orange',
      primary: 'name',
      fields: [
        title('Dish'),
        f('source', 'Source', 'url'),
        f(
          'cuisine',
          'Cuisine',
          'multiSelect',
          options('Italian', 'Japanese', 'Mexican', 'Indian', 'Baking'),
        ),
        f('made', 'Made on', 'date'),
        f('rating', 'Rating', 'rating', STARS),
        notes(),
      ],
      views: [
        { name: 'All', sorts: [{ field: 'made', dir: 'desc' }] },
        {
          name: 'Favorites',
          filter: where('rating', 'gte', 4),
          sorts: [{ field: 'rating', dir: 'desc' }],
        },
      ],
    },
  },
];

export const TEMPLATES_BY_KEY: ReadonlyMap<string, Template> = new Map(
  TEMPLATES.map((t) => [t.key, t]),
);
