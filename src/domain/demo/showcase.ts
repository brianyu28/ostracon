/**
 * The demo document offered on the welcome screen: a small, hand-written set of entirely
 * fictional restaurants, books, movies and trips, built from the real templates so it looks
 * exactly like what a user would create. Companions are a multi-select of first names rather
 * than links to a People collection, which keeps the demo to the four collections.
 *
 * `generate.ts` is the scalable generator for tests, fixtures and benchmarks; this one is only
 * for showing the app. Dates are relative to `endDate`, so "This year" views always have records.
 */
import { produce } from 'immer';
import { addDays, type ISODate } from '@/lib/date';
import { commands } from '../commands';
import { putRecord, type DocModel } from '../model';
import { createEmptyDocument } from '../schema/defaults';
import type { FieldOf, Id, LocationValue, RecordEntity, Value } from '../schema/types';
import { TEMPLATES_BY_KEY } from '../templates/catalog';
import { options } from '../templates/model';
import { planTemplate, pruneTemplates, type TemplatePlan } from '../templates/plan';
import { createIdMaker, createRng } from './generate';

export interface ShowcaseOptions {
  /** Date the demo is "as of". */
  endDate: ISODate;
  appVersion: string;
  seed?: number;
}

const PEOPLE = ['Maya', 'Theo', 'Priya', 'Sam', 'Lena', 'Omar', 'Jules', 'Nora'];

type Place = LocationValue;
const HOME: Place = { city: 'Portland', region: 'OR', country: 'USA' };
const SEATTLE: Place = { city: 'Seattle', region: 'WA', country: 'USA' };

const CUISINES = [
  'Italian',
  'Japanese',
  'Mexican',
  'Thai',
  'Indian',
  'French',
  'Korean',
  'Mediterranean',
  'Bakery',
];

/** Fictional restaurants; `weight` is how often they're visited. */
const RESTAURANTS: {
  name: string;
  cuisine: string[];
  place: Place;
  rating: number;
  weight: number;
}[] = [
  { name: 'Copper Pot Trattoria', cuisine: ['Italian'], place: HOME, rating: 5, weight: 6 },
  { name: 'Juniper Noodle Bar', cuisine: ['Japanese'], place: HOME, rating: 4, weight: 5 },
  { name: 'Saffron House', cuisine: ['Indian'], place: HOME, rating: 4, weight: 4 },
  { name: 'Little Lantern', cuisine: ['Thai'], place: HOME, rating: 4, weight: 4 },
  { name: 'Taqueria Sol', cuisine: ['Mexican'], place: HOME, rating: 5, weight: 5 },
  { name: 'Olive & Fern', cuisine: ['Mediterranean'], place: HOME, rating: 3, weight: 2 },
  { name: 'Bistro Marlowe', cuisine: ['French'], place: HOME, rating: 4, weight: 2 },
  { name: 'Morning Crumb', cuisine: ['Bakery'], place: HOME, rating: 5, weight: 4 },
  { name: 'Seoul Kitchen Table', cuisine: ['Korean'], place: SEATTLE, rating: 4, weight: 1 },
  { name: 'Harbor Grill', cuisine: ['Mediterranean'], place: SEATTLE, rating: 2, weight: 1 },
];

const MEAL_NOTES = [
  'Ask for the corner table.',
  'Get the seasonal special.',
  'Long wait on weekends; go early.',
  'Too loud for conversation.',
  'Dessert was the highlight.',
  'Birthday dinner.',
];

const BOOKS: {
  title: string;
  author: string;
  genre: string[];
  pages: number;
  format: string;
  status: 'To read' | 'Reading' | 'Read' | 'Abandoned';
}[] = [
  {
    title: 'The Glass Orchard',
    author: 'Wren Calloway',
    genre: ['Fiction'],
    pages: 342,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'Salt and Signal',
    author: 'Idris Fenn',
    genre: ['Fiction'],
    pages: 288,
    format: 'E-book',
    status: 'Read',
  },
  {
    title: 'A Short History of Clocks',
    author: 'Marta Vell',
    genre: ['Nonfiction', 'History'],
    pages: 410,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'The Lighthouse Ledger',
    author: 'Hollis Grey',
    genre: ['Mystery'],
    pages: 316,
    format: 'Audiobook',
    status: 'Read',
  },
  {
    title: 'Northern Water',
    author: 'Anya Brook',
    genre: ['Fiction'],
    pages: 254,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'Small Engines',
    author: 'Desmond Oyelaran',
    genre: ['Science', 'Nonfiction'],
    pages: 198,
    format: 'E-book',
    status: 'Read',
  },
  {
    title: 'The Quiet Atlas',
    author: 'Wren Calloway',
    genre: ['Fiction'],
    pages: 376,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'Murder at Thornfield Pier',
    author: 'Hollis Grey',
    genre: ['Mystery'],
    pages: 298,
    format: 'Audiobook',
    status: 'Read',
  },
  {
    title: 'The Weight of Rivers',
    author: 'Esme Larkin',
    genre: ['Nonfiction', 'Science'],
    pages: 452,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'Paper Winter',
    author: 'Kenji Arlo',
    genre: ['Fiction'],
    pages: 220,
    format: 'E-book',
    status: 'Read',
  },
  {
    title: 'Empires of Salt',
    author: 'Marta Vell',
    genre: ['History'],
    pages: 512,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'The Ninth Key',
    author: 'Hollis Grey',
    genre: ['Mystery'],
    pages: 330,
    format: 'Audiobook',
    status: 'Read',
  },
  {
    title: 'How Bridges Stand',
    author: 'Desmond Oyelaran',
    genre: ['Science'],
    pages: 264,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'Hidden Garden',
    author: 'Anya Brook',
    genre: ['Fiction'],
    pages: 300,
    format: 'E-book',
    status: 'Read',
  },
  {
    title: 'The Long Way Home',
    author: 'Esme Larkin',
    genre: ['Nonfiction'],
    pages: 236,
    format: 'Print',
    status: 'Read',
  },
  {
    title: 'Bright Harbor',
    author: 'Kenji Arlo',
    genre: ['Fiction'],
    pages: 284,
    format: 'Print',
    status: 'Reading',
  },
  {
    title: 'The Cartographer’s Daughter',
    author: 'Wren Calloway',
    genre: ['Fiction', 'History'],
    pages: 468,
    format: 'Audiobook',
    status: 'Reading',
  },
  {
    title: 'Counting Stars',
    author: 'Esme Larkin',
    genre: ['Science'],
    pages: 312,
    format: 'Print',
    status: 'To read',
  },
  {
    title: 'The Last Ferry',
    author: 'Hollis Grey',
    genre: ['Mystery'],
    pages: 290,
    format: 'E-book',
    status: 'To read',
  },
  {
    title: 'Iron and Ivy',
    author: 'Marta Vell',
    genre: ['History'],
    pages: 544,
    format: 'Print',
    status: 'To read',
  },
  {
    title: 'Fieldnotes on Silence',
    author: 'Idris Fenn',
    genre: ['Nonfiction'],
    pages: 176,
    format: 'Print',
    status: 'To read',
  },
  {
    title: 'The Ember Room',
    author: 'Anya Brook',
    genre: ['Fiction'],
    pages: 352,
    format: 'E-book',
    status: 'To read',
  },
  {
    title: 'An Index of Everything',
    author: 'Desmond Oyelaran',
    genre: ['Science', 'Nonfiction'],
    pages: 620,
    format: 'Print',
    status: 'Abandoned',
  },
];

const MOVIES: { title: string; year: number; director: string; genre: string[] }[] = [
  { title: 'Midnight at the Observatory', year: 2019, director: 'Clara Voss', genre: ['Drama'] },
  { title: 'The Paper Kites', year: 2021, director: 'Ravi Anand', genre: ['Comedy', 'Drama'] },
  { title: 'Undertow', year: 2018, director: 'Mika Halvorsen', genre: ['Action'] },
  { title: 'Small Wonders', year: 2022, director: 'Ines Duarte', genre: ['Animation'] },
  { title: 'The Salt Road', year: 2020, director: 'Tobias Reyne', genre: ['Documentary'] },
  { title: 'Second Breakfast Club', year: 2023, director: 'Ravi Anand', genre: ['Comedy'] },
  { title: 'Ashfall', year: 2017, director: 'Mika Halvorsen', genre: ['Action', 'Drama'] },
  { title: 'Letters to Juniper', year: 2021, director: 'Clara Voss', genre: ['Drama'] },
  { title: 'The Clockmaker’s Fox', year: 2024, director: 'Ines Duarte', genre: ['Animation'] },
  { title: 'Deep Current', year: 2022, director: 'Tobias Reyne', genre: ['Documentary'] },
  { title: 'Parallel Summer', year: 2019, director: 'Hana Morrow', genre: ['Drama', 'Comedy'] },
  { title: 'Velocity Nine', year: 2023, director: 'Mika Halvorsen', genre: ['Action'] },
  { title: 'The Long Table', year: 2024, director: 'Hana Morrow', genre: ['Comedy'] },
  {
    title: 'Northern Lights, Southern Skies',
    year: 2020,
    director: 'Tobias Reyne',
    genre: ['Documentary'],
  },
  { title: 'Orchard Road', year: 2025, director: 'Clara Voss', genre: ['Drama'] },
  { title: 'Robot Gardener', year: 2025, director: 'Ines Duarte', genre: ['Animation', 'Comedy'] },
  { title: 'The Ninth Hour', year: 2026, director: 'Hana Morrow', genre: ['Drama'] },
  { title: 'Overdrive', year: 2026, director: 'Mika Halvorsen', genre: ['Action'] },
  { title: 'Tides', year: 2026, director: 'Tobias Reyne', genre: ['Documentary'] },
];
/** How many of MOVIES (from the end) are still on the watchlist. */
const WATCHLIST = 4;

/** Trips, newest first; `daysAgo` is when they start relative to the end date (negative: upcoming). */
const TRIPS: {
  name: string;
  daysAgo: number;
  nights: number;
  destination: Place;
  purpose: string;
  with: number;
  notes?: string;
}[] = [
  {
    name: 'Lisbon in spring',
    daysAgo: -110,
    nights: 7,
    destination: { city: 'Lisbon', country: 'Portugal' },
    purpose: 'Vacation',
    with: 2,
  },
  {
    name: 'Seattle conference',
    daysAgo: 40,
    nights: 3,
    destination: SEATTLE,
    purpose: 'Work',
    with: 0,
  },
  {
    name: 'Coast weekend',
    daysAgo: 120,
    nights: 2,
    destination: { city: 'Cannon Beach', region: 'OR', country: 'USA' },
    purpose: 'Vacation',
    with: 3,
    notes: 'Rented the cabin by the north trailhead.',
  },
  {
    name: 'Kyoto',
    daysAgo: 230,
    nights: 10,
    destination: { city: 'Kyoto', country: 'Japan' },
    purpose: 'Vacation',
    with: 1,
    notes: 'Go in late autumn again.',
  },
  {
    name: 'Thanksgiving',
    daysAgo: 370,
    nights: 4,
    destination: { city: 'Denver', region: 'CO', country: 'USA' },
    purpose: 'Family',
    with: 1,
  },
  {
    name: 'Wedding in Mexico City',
    daysAgo: 480,
    nights: 5,
    destination: { city: 'Mexico City', country: 'Mexico' },
    purpose: 'Event',
    with: 2,
  },
  {
    name: 'Client visit',
    daysAgo: 560,
    nights: 2,
    destination: { city: 'Chicago', region: 'IL', country: 'USA' },
    purpose: 'Work',
    with: 0,
  },
  {
    name: 'Iceland ring road',
    daysAgo: 700,
    nights: 9,
    destination: { city: 'Reykjavík', country: 'Iceland' },
    purpose: 'Vacation',
    with: 2,
    notes: 'Pack layers; weather changes hourly.',
  },
  {
    name: 'Holidays at home',
    daysAgo: 735,
    nights: 6,
    destination: { city: 'Denver', region: 'CO', country: 'USA' },
    purpose: 'Family',
    with: 1,
  },
  {
    name: 'Vancouver long weekend',
    daysAgo: 880,
    nights: 3,
    destination: { city: 'Vancouver', region: 'BC', country: 'Canada' },
    purpose: 'Vacation',
    with: 1,
  },
];

/** A template's plan with every link to People replaced by a multi-select of names. */
function planWithoutPeople(
  key: string,
  configs: Record<string, Record<string, unknown>> = {},
): TemplatePlan {
  const template = TEMPLATES_BY_KEY.get(key);
  if (!template) throw new Error(`Unknown template: ${key}`);
  const plan = planTemplate(template, { withLog: false, existing: [] });
  for (const c of plan.collections)
    c.fields = c.fields.map((f) => {
      if (f.link?.templateKey === 'people')
        return { key: f.key, name: f.name, type: 'multiSelect', config: options(...PEOPLE) };
      const config = configs[f.key];
      return config ? { ...f, config } : f;
    });
  return pruneTemplates(plan);
}

export function generateShowcaseDocument(opts: ShowcaseOptions): DocModel {
  const rng = createRng(opts.seed ?? 42);
  const makeId = createIdMaker(rng);
  const end = opts.endDate;
  const stamp = (date: ISODate) => `${date}T12:00:00.000Z`;
  const now = stamp(end);

  const empty = createEmptyDocument({ appVersion: opts.appVersion, now });
  empty.meta.fileId = makeId('file');
  empty.meta.createdAt = stamp(addDays(end, -3 * 365));

  return produce(empty, (draft) => {
    const ctx = { now, newId: makeId };
    const build = (plan: TemplatePlan): Id => {
      const run = commands.createFromTemplate.run;
      return run(draft, { plan }, ctx).main ?? '';
    };

    const R = build(planWithoutPeople('restaurants', { cuisine: options(...CUISINES) }));
    const B = build(planWithoutPeople('books'));
    const M = build(planWithoutPeople('movies'));
    const T = build(planWithoutPeople('trips'));

    /** Field lookup by collection and name, with select option ids by name. */
    const fieldOf = (collectionId: Id, name: string) => {
      const field = Object.values(draft.fields).find(
        (f) => f.collectionId === collectionId && f.name === name,
      );
      if (!field) throw new Error(`Missing field: ${name}`);
      const optionId = (option: string) =>
        (field as FieldOf<'singleSelect'>).config.options.find((o) => o.name === option)?.id ?? '';
      return {
        id: field.id,
        one: optionId,
        many: (names: readonly string[]) => {
          const all = (field as FieldOf<'multiSelect'>).config.options;
          const ids = all.filter((o) => names.includes(o.name)).map((o) => o.id);
          return ids.length ? ids : undefined;
        },
      };
    };
    const add = (collectionId: Id, values: Record<Id, Value | undefined>, createdOn: ISODate) => {
      const clean: RecordEntity['values'] = {};
      for (const [k, v] of Object.entries(values)) if (v !== undefined) clean[k] = v;
      const created = stamp(createdOn < end ? createdOn : end);
      putRecord(draft, {
        id: makeId('record'),
        collectionId,
        values: clean,
        createdAt: created,
        updatedAt: created,
      });
    };
    const company = (min: number, max: number) => rng.some(PEOPLE, min, max);

    // ── Restaurants: one record per meal, favorites repeated ──
    {
      const name = fieldOf(R, 'Restaurant');
      const date = fieldOf(R, 'Date');
      const withF = fieldOf(R, 'With');
      const cuisine = fieldOf(R, 'Cuisine');
      const location = fieldOf(R, 'Location');
      const rating = fieldOf(R, 'Rating');
      const notes = fieldOf(R, 'Notes');
      const pool = RESTAURANTS.flatMap((r) => Array<typeof r>(r.weight).fill(r));
      let day = end;
      for (let i = 0; i < 48; i++) {
        day = addDays(day, -rng.int(5, 24));
        const r = rng.pick(pool);
        add(
          R,
          {
            [name.id]: r.name,
            [date.id]: day,
            [withF.id]: withF.many(company(0, 3)),
            [cuisine.id]: cuisine.many(r.cuisine),
            [location.id]: r.place,
            [rating.id]: Math.max(1, Math.min(5, r.rating + rng.pick([-1, 0, 0, 0, 1]))),
            [notes.id]: rng.chance(0.15) ? rng.pick(MEAL_NOTES) : undefined,
          },
          day,
        );
      }
    }

    // ── Books ──
    {
      const title = fieldOf(B, 'Title');
      const author = fieldOf(B, 'Author');
      const status = fieldOf(B, 'Status');
      const started = fieldOf(B, 'Started');
      const finished = fieldOf(B, 'Finished');
      const rating = fieldOf(B, 'Rating');
      const format = fieldOf(B, 'Format');
      const pages = fieldOf(B, 'Pages');
      const genre = fieldOf(B, 'Genre');
      // Finished books are read back to back, newest first.
      let cursor = addDays(end, -rng.int(3, 12));
      for (const b of BOOKS) {
        let start: ISODate | undefined;
        let finish: ISODate | undefined;
        let added = addDays(end, -rng.int(10, 600));
        if (b.status === 'Read') {
          finish = cursor;
          start = addDays(finish, -Math.round(b.pages / rng.int(15, 40)));
          cursor = addDays(start, -rng.int(2, 30));
          added = addDays(start, -rng.int(0, 60));
        } else if (b.status === 'Reading') {
          start = addDays(end, -rng.int(2, 20));
          added = addDays(start, -rng.int(0, 90));
        } else if (b.status === 'Abandoned') {
          start = addDays(end, -rng.int(120, 300));
          added = addDays(start, -rng.int(0, 60));
        }
        add(
          B,
          {
            [title.id]: b.title,
            [author.id]: b.author,
            [status.id]: status.one(b.status),
            [started.id]: start,
            [finished.id]: finish,
            [rating.id]:
              b.status === 'Read' ? rng.int(3, 5) : b.status === 'Abandoned' ? 2 : undefined,
            [format.id]: format.one(b.format),
            [pages.id]: b.pages,
            [genre.id]: genre.many(b.genre),
          },
          added,
        );
      }
    }

    // ── Movies: most watched, the newest few still on the watchlist ──
    {
      const title = fieldOf(M, 'Title');
      const year = fieldOf(M, 'Year');
      const director = fieldOf(M, 'Director');
      const genre = fieldOf(M, 'Genre');
      const watched = fieldOf(M, 'Watched on');
      const where = fieldOf(M, 'Where');
      const withF = fieldOf(M, 'With');
      const rating = fieldOf(M, 'Rating');
      const seen = MOVIES.length - WATCHLIST;
      MOVIES.forEach((m, i) => {
        const isSeen = i < seen;
        // Spread viewings over the last two years, oldest first.
        const on = isSeen
          ? addDays(end, -Math.round(((seen - i) / seen) * 700) + rng.int(0, 20))
          : undefined;
        add(
          M,
          {
            [title.id]: m.title,
            [year.id]: m.year,
            [director.id]: m.director,
            [genre.id]: genre.many(m.genre),
            [watched.id]: on,
            [where.id]: on
              ? where.one(rng.pick(['Theater', 'Streaming', 'Streaming', 'TV', 'Flight']))
              : undefined,
            [withF.id]: on ? withF.many(company(0, 2)) : undefined,
            [rating.id]: on ? rng.int(2, 5) : undefined,
          },
          on ?? addDays(end, -rng.int(1, 60)),
        );
      });
    }

    // ── Trips ──
    {
      const name = fieldOf(T, 'Name');
      const dates = fieldOf(T, 'Dates');
      const destination = fieldOf(T, 'Destination');
      const withF = fieldOf(T, 'With');
      const purpose = fieldOf(T, 'Purpose');
      const notes = fieldOf(T, 'Notes');
      for (const t of TRIPS) {
        const start = addDays(end, -t.daysAgo);
        add(
          T,
          {
            [name.id]: t.name,
            [dates.id]: { start, end: addDays(start, t.nights) },
            [destination.id]: t.destination,
            [withF.id]: withF.many(company(t.with, t.with)),
            [purpose.id]: purpose.one(t.purpose),
            [notes.id]: t.notes,
          },
          addDays(start, -rng.int(14, 90)),
        );
      }
    }
  });
}
