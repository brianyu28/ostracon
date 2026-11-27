/**
 * Seeded generator for entirely synthetic demo data. Used for the in-app demo, test fixtures
 * and performance benchmarks, so no real data ever needs to enter the repository. The same
 * options always produce the same document.
 *
 * The schema (collections, fields, link pairs, views) is built with the real commands, so it
 * is exactly what the app would create. Records and links are written directly, which keeps
 * benchmark-sized documents fast to generate; the integrity check in the tests confirms they
 * are valid.
 */
import { produce, type Draft } from 'immer';
import { addDays, type ISODate } from '@/lib/date';
import { ID_PREFIXES, type IdKind } from '@/lib/id';
import { makeLocalDateTime } from '@/lib/partialDate';
import { commands, type CommandName, type CommandPayload, type CommandResult } from '../commands';
import { storedLink, type LinkField } from '../links';
import { putLink, putRecord, type DocModel } from '../model';
import { createEmptyDocument } from '../schema/defaults';
import type { Field, FieldOf, Id, RecordEntity, Value } from '../schema/types';

export interface DemoOptions {
  /** Date the demo is "as of". Pass explicitly for deterministic output. */
  endDate: ISODate;
  appVersion: string;
  seed?: number;
  /**
   * Number of people; the other collections scale with it (about 6.75 records per person in
   * all, so 7,400 gives a ~50k-record benchmark file). Default 24.
   */
  records?: number;
}

/** mulberry32: tiny, fast, good-enough seeded PRNG. */
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    /** A few distinct items. */
    some: <T>(items: readonly T[], min: number, max: number): T[] => {
      const pool = [...items];
      const out: T[] = [];
      for (let n = int(min, max); n > 0 && pool.length; n--)
        out.push(pool.splice(Math.floor(next() * pool.length), 1)[0] as T);
      return out;
    },
  };
}

const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const FIRST = [
  'Ada',
  'Bea',
  'Cal',
  'Dev',
  'Eli',
  'Fay',
  'Gus',
  'Hal',
  'Ivy',
  'Jo',
  'Kit',
  'Lu',
  'Mo',
  'Nia',
];
const LAST = [
  'Archer',
  'Bloom',
  'Cove',
  'Dale',
  'Ember',
  'Frost',
  'Grove',
  'Heath',
  'Isle',
  'Juno',
];
const PLACES: readonly { city: string; region?: string; country: string }[] = [
  { city: 'Springfield', region: 'IL', country: 'USA' },
  { city: 'Riverton', region: 'WY', country: 'USA' },
  { city: 'Lakeside', region: 'CA', country: 'USA' },
  { city: 'Fairview', region: 'OR', country: 'USA' },
  { city: 'Brookhaven', region: 'NY', country: 'USA' },
  { city: 'Port Elloran', country: 'Canada' },
  { city: 'Valmora', country: 'Italy' },
];
const PLACE_WORDS = ['Copper', 'Juniper', 'Lantern', 'Saffron', 'Harbor', 'Olive', 'Ember', 'Fern'];
const PLACE_KINDS = ['Kitchen', 'Bistro', 'Noodle Bar', 'Taqueria', 'Diner', 'Bakery', 'Grill'];
const BOOK_WORDS = ['Silent', 'Paper', 'Northern', 'Glass', 'Hidden', 'Last', 'Small', 'Bright'];
const BOOK_NOUNS = [
  'River',
  'Garden',
  'Lighthouse',
  'Orchard',
  'Atlas',
  'Winter',
  'Harbor',
  'Clock',
];
const NOTES = [
  'Great **service**; ask for the corner table.',
  'Try the seasonal special next time.',
  '- Quiet on weekdays\n- Cash only',
  'Recommended by a friend.',
];

export function generateDemoDocument(options: DemoOptions): DocModel {
  const rng = createRng(options.seed ?? 42);
  const people = options.records ?? 24;
  const end = options.endDate;
  const stamp = (date: ISODate) => `${date}T12:00:00.000Z`;
  const now = stamp(end);
  const pastDate = (maxDays: number) => addDays(end, -rng.int(0, maxDays));

  const makeId = (kind: IdKind): Id => {
    let out = '';
    for (let i = 0; i < 12; i++) out += ID_CHARS.charAt(Math.floor(rng.next() * 62));
    return `${ID_PREFIXES[kind]}_${out}`;
  };

  const empty = createEmptyDocument({ appVersion: options.appVersion, now });
  empty.meta.fileId = makeId('file');
  empty.meta.createdAt = stamp(addDays(end, -5 * 365));

  return produce(empty, (draft) => {
    const ctx = { now, newId: makeId };
    const run = <K extends CommandName>(name: K, payload: CommandPayload<K>): CommandResult<K> =>
      (commands[name].run as (d: Draft<DocModel>, p: unknown, c: typeof ctx) => unknown)(
        draft,
        payload,
        ctx,
      ) as CommandResult<K>;

    // ── Schema ──
    const collection = (name: string, icon: string, primaryName: string) => {
      const id = run('createCollection', { name, icon });
      const primary = draft.collections[id]?.primaryFieldId ?? '';
      run('updateField', { id: primary, changes: { name: primaryName } });
      return { id, primary };
    };
    const field = (collectionId: Id, name: string, type: Field['type'], config?: unknown) =>
      run('createField', { collectionId, name, type, ...(config === undefined ? {} : { config }) });
    const options = (...names: string[]) => ({ options: names.map((name) => ({ name })) });
    const optionIds = (fieldId: Id) =>
      (draft.fields[fieldId] as FieldOf<'singleSelect'>).config.options.map((o) => o.id);

    const P = collection('People', 'users', 'Name');
    const pRelationship = field(
      P.id,
      'Relationship',
      'multiSelect',
      options('Friend', 'Family', 'Coworker', 'Neighbor'),
    );
    const pBirthday = field(P.id, 'Birthday', 'date', { partial: true });
    const pEmail = field(P.id, 'Email', 'email');
    const pPhone = field(P.id, 'Phone', 'phone');
    const pLocation = field(P.id, 'Lives in', 'location', { parts: ['city', 'region', 'country'] });
    const pNotes = field(P.id, 'Notes', 'richText');
    const friends = run('createLinkField', {
      collectionId: P.id,
      name: 'Friends',
      targetCollectionId: P.id,
      symmetric: true,
    });

    const R = collection('Restaurants', 'tools-kitchen-2', 'Name');
    const rCuisine = field(
      R.id,
      'Cuisine',
      'multiSelect',
      options('Italian', 'Mexican', 'Japanese', 'Thai', 'Indian', 'American', 'French'),
    );
    const rLocation = field(R.id, 'Location', 'location', { parts: ['city', 'region', 'country'] });
    const rPrice = field(R.id, 'Price', 'singleSelect', options('$', '$$', '$$$', '$$$$'));
    const rRating = field(R.id, 'Rating', 'rating', { max: 5 });
    const rReturn = field(R.id, 'Want to return', 'checkbox');
    const rWebsite = field(R.id, 'Website', 'url');

    const V = collection('Restaurant visits', 'calendar', 'Visit');
    const visitRestaurant = run('createLinkField', {
      collectionId: V.id,
      name: 'Restaurant',
      targetCollectionId: R.id,
      inverseName: 'Visits',
      multiple: false,
    });
    const vDate = field(V.id, 'Date', 'date');
    const visitWith = run('createLinkField', {
      collectionId: V.id,
      name: 'With',
      targetCollectionId: P.id,
      inverseName: 'Meals',
    });
    const vSpent = field(V.id, 'Spent', 'number', { style: 'currency', thousands: true });
    const vNotes = field(V.id, 'Notes', 'text', { multiline: true });

    const B = collection('Books', 'book', 'Title');
    const bAuthor = field(B.id, 'Author', 'text');
    const bStatus = field(
      B.id,
      'Status',
      'singleSelect',
      options('To read', 'Reading', 'Read', 'Abandoned'),
    );
    const bStarted = field(B.id, 'Started', 'date', { partial: true });
    const bFinished = field(B.id, 'Finished', 'date', { partial: true });
    const bRating = field(B.id, 'Rating', 'rating', { max: 5 });
    const bPages = field(B.id, 'Pages', 'number', { style: 'plain', thousands: true });
    const bGenre = field(
      B.id,
      'Genre',
      'multiSelect',
      options('Fiction', 'Mystery', 'History', 'Science', 'Poetry'),
    );
    field(B.id, 'Added', 'createdTime');

    const T = collection('Trips', 'map-pin', 'Trip');
    const tDates = field(T.id, 'Dates', 'dateRange');
    const tDestination = field(T.id, 'Destination', 'location', { parts: ['city', 'country'] });
    const tPurpose = field(T.id, 'Purpose', 'singleSelect', options('Vacation', 'Work', 'Family'));
    const tFlight = field(T.id, 'Flight time', 'duration', { display: 'compact' });
    const tripWith = run('createLinkField', {
      collectionId: T.id,
      name: 'Companions',
      targetCollectionId: P.id,
      inverseName: 'Trips',
    });

    const D = collection('Devices', 'devices', 'Device');
    const dKind = field(
      D.id,
      'Kind',
      'singleSelect',
      options('Phone', 'Laptop', 'Tablet', 'Watch'),
    );
    const dModel = field(D.id, 'Model', 'text');
    const deviceOwner = run('createLinkField', {
      collectionId: D.id,
      name: 'Owner',
      targetCollectionId: P.id,
      inverseName: 'Devices',
      multiple: false,
    });
    const dPurchased = field(D.id, 'Purchased', 'date');
    const dPrice = field(D.id, 'Price', 'number', { style: 'currency' });
    const dBackup = field(D.id, 'Last backup', 'dateTime');
    const dPercent = field(D.id, 'Battery health', 'number', { style: 'percent' });

    // ── Views ──
    const firstView = (collectionId: Id) =>
      Object.values(draft.views).find((v) => v.collectionId === collectionId)?.id ?? '';
    const [toRead] = optionIds(bStatus);
    run('updateView', {
      id: firstView(V.id),
      changes: { sorts: [{ fieldId: vDate, dir: 'desc' }], summaries: { [vSpent]: 'sum' } },
    });
    const thisYear = run('createView', { collectionId: V.id, name: 'This year', layout: 'table' });
    run('updateView', {
      id: thisYear,
      changes: {
        filter: {
          op: 'and',
          items: [
            {
              fieldId: vDate,
              operator: 'within',
              value: { kind: 'period', unit: 'year', offset: 0 },
            },
          ],
        },
        sorts: [{ fieldId: vDate, dir: 'desc' }],
      },
    });
    // Wrap the notes in this view.
    const thisYearFields = draft.views[thisYear]?.fields ?? [];
    run('setViewFields', {
      id: thisYear,
      fields: thisYearFields.map((f) => (f.fieldId === vNotes ? { ...f, wrap: true } : f)),
    });
    run('createView', { collectionId: V.id, name: 'Calendar', layout: 'calendar' });
    const wantToReturn = run('createView', {
      collectionId: R.id,
      name: 'Want to return',
      layout: 'table',
    });
    run('updateView', {
      id: wantToReturn,
      changes: { filter: { op: 'and', items: [{ fieldId: rReturn, operator: 'isChecked' }] } },
    });
    run('createView', { collectionId: R.id, name: 'By price', layout: 'board' });
    const readingList = run('createView', {
      collectionId: B.id,
      name: 'Reading list',
      layout: 'table',
    });
    run('updateView', {
      id: readingList,
      changes: {
        filter: {
          op: 'and',
          items: [{ fieldId: bStatus, operator: 'isAnyOf', value: toRead ? [toRead] : [] }],
        },
      },
    });
    run('createView', { collectionId: B.id, name: 'Board', layout: 'board' });
    run('createView', { collectionId: T.id, name: 'Calendar', layout: 'calendar' });

    // ── Records (written directly; see the module comment) ──
    const add = (
      collectionId: Id,
      values: Record<Id, Value | undefined>,
      createdOn: ISODate,
    ): Id => {
      const clean: RecordEntity['values'] = {};
      for (const [k, v] of Object.entries(values)) if (v !== undefined) clean[k] = v;
      const record: RecordEntity = {
        id: makeId('record'),
        collectionId,
        values: clean,
        createdAt: stamp(createdOn),
        updatedAt: stamp(createdOn),
      };
      putRecord(draft, record);
      return record.id;
    };
    const link = (fieldId: Id, recordId: Id, targetId: Id, on: ISODate) => {
      const f = draft.fields[fieldId] as LinkField;
      const [canonical, from, to] = storedLink(f, recordId, targetId);
      putLink(draft, [canonical, from, to, stamp(on)]);
    };
    const place = () => {
      const p = rng.pick(PLACES);
      return p.region
        ? { city: p.city, region: p.region, country: p.country }
        : { city: p.city, country: p.country };
    };

    const relationshipIds = optionIds(pRelationship);
    const personIds: Id[] = [];
    for (let i = 0; i < people; i++) {
      const first = rng.pick(FIRST);
      const last = rng.pick(LAST);
      const year = rng.int(1950, 2010);
      const birthday = rng.chance(0.3)
        ? String(year)
        : `${String(year)}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
      personIds.push(
        add(
          P.id,
          {
            [P.primary]: `${first} ${last}`,
            [pRelationship]: rng.chance(0.9)
              ? rng
                  .some(relationshipIds, 1, 2)
                  .sort((a, b) => relationshipIds.indexOf(a) - relationshipIds.indexOf(b))
              : undefined,
            [pBirthday]: rng.chance(0.7) ? birthday : undefined,
            [pEmail]: rng.chance(0.6) ? `${first}.${last}@example.com`.toLowerCase() : undefined,
            [pPhone]: rng.chance(0.4)
              ? `555-01${String(rng.int(0, 99)).padStart(2, '0')}`
              : undefined,
            [pLocation]: rng.chance(0.8) ? place() : undefined,
            [pNotes]: rng.chance(0.2) ? rng.pick(NOTES) : undefined,
          },
          pastDate(1800),
        ),
      );
    }
    // A sparse friendship graph (symmetric: each pair stored once).
    for (let i = 1; i < personIds.length; i++) {
      if (rng.chance(0.5))
        link(
          friends.fieldId,
          personIds[i] ?? '',
          personIds[rng.int(0, i - 1)] ?? '',
          pastDate(1000),
        );
    }

    const cuisineIds = optionIds(rCuisine);
    const priceIds = optionIds(rPrice);
    const restaurantIds: Id[] = [];
    for (let i = 0; i < people; i++) {
      restaurantIds.push(
        add(
          R.id,
          {
            [R.primary]: `${rng.pick(PLACE_WORDS)} ${rng.pick(PLACE_KINDS)}`,
            [rCuisine]: rng
              .some(cuisineIds, 1, 2)
              .sort((a, b) => cuisineIds.indexOf(a) - cuisineIds.indexOf(b)),
            [rLocation]: place(),
            [rPrice]: rng.pick(priceIds),
            [rRating]: rng.chance(0.85) ? rng.int(2, 5) : undefined,
            [rReturn]: rng.chance(0.4) ? true : undefined,
            [rWebsite]: rng.chance(0.3) ? `https://example.com/r/${String(i)}` : undefined,
          },
          pastDate(1800),
        ),
      );
    }

    for (let i = 0; i < people * 3; i++) {
      const date = pastDate(1500);
      const restaurant = rng.pick(restaurantIds);
      const id = add(
        V.id,
        {
          [V.primary]: `Dinner ${date}`,
          [vDate]: date,
          [vSpent]: rng.chance(0.8) ? rng.int(1500, 25000) / 100 : undefined,
          [vNotes]: rng.chance(0.15) ? rng.pick(NOTES).replace(/\*\*/g, '') : undefined,
        },
        date,
      );
      link(visitRestaurant.fieldId, id, restaurant, date);
      for (const person of rng.some(personIds, 0, 3)) link(visitWith.fieldId, id, person, date);
    }

    const statusIds = optionIds(bStatus);
    const genreIds = optionIds(bGenre);
    for (let i = 0; i < people; i++) {
      const status = rng.pick(statusIds);
      const read = status === statusIds[2];
      const started = pastDate(1500);
      const finished = addDays(started, rng.int(3, 60));
      add(
        B.id,
        {
          [B.primary]: `The ${rng.pick(BOOK_WORDS)} ${rng.pick(BOOK_NOUNS)}`,
          [bAuthor]: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
          [bStatus]: status,
          [bStarted]:
            status !== statusIds[0] ? (rng.chance(0.2) ? started.slice(0, 7) : started) : undefined,
          [bFinished]: read && finished <= end ? finished : undefined,
          [bRating]: read ? rng.int(1, 5) : undefined,
          [bPages]: rng.int(90, 900),
          [bGenre]: rng
            .some(genreIds, 1, 2)
            .sort((a, b) => genreIds.indexOf(a) - genreIds.indexOf(b)),
        },
        started,
      );
    }

    const purposeIds = optionIds(tPurpose);
    for (let i = 0; i < Math.max(1, Math.round(people / 4)); i++) {
      const start = pastDate(1800);
      const d = rng.pick(PLACES);
      const id = add(
        T.id,
        {
          [T.primary]: `${d.city} trip`,
          [tDates]: { start, end: addDays(start, rng.int(1, 14)) },
          [tDestination]: { city: d.city, country: d.country },
          [tPurpose]: rng.pick(purposeIds),
          [tFlight]: rng.chance(0.7) ? rng.int(2, 24) * 1800 : undefined,
        },
        start,
      );
      for (const person of rng.some(personIds, 0, 3)) link(tripWith.fieldId, id, person, start);
    }

    const kindIds = optionIds(dKind);
    // Each person owns at most one of these devices (the Owner side is single-valued).
    const owners = rng.some(personIds, 0, Math.round(people / 2));
    for (let i = 0; i < Math.round(people / 2); i++) {
      const purchased = pastDate(1500);
      const kind = rng.pick(kindIds);
      const id = add(
        D.id,
        {
          [D.primary]: `Device ${String(i + 1)}`,
          [dKind]: kind,
          [dModel]: `Model ${String(rng.int(1, 9))}${rng.pick(['', ' Pro', ' Mini'])}`,
          [dPurchased]: purchased,
          [dPrice]: rng.int(99, 2499),
          [dBackup]: rng.chance(0.5)
            ? makeLocalDateTime(pastDate(60), rng.int(0, 23), rng.int(0, 59))
            : undefined,
          [dPercent]: rng.chance(0.5) ? rng.int(70, 100) / 100 : undefined,
        },
        purchased,
      );
      const owner = owners[i];
      if (owner) link(deviceOwner.fieldId, id, owner, purchased);
    }
  });
}
