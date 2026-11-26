import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { getRecord, iterateRecords } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import type { Id } from '@/domain/schema/types';
import { docStore } from '@/store/docStore';
import { sessionStore } from '@/store/sessionStore';
import { tableStore } from './tableStore';

const doc = () => docStore.getState().doc!;
const dispatch = docStore.getState().dispatch;
let collectionId: Id;
let title: Id;
let pages: Id;
let ids: Id[];

beforeEach(() => {
  // jsdom has no layout: give elements a size so the virtualized rows render.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-26T12:00:00Z') });
  docStore.getState().load(createEmptyDocument({ appVersion: 'test' }));
  sessionStore.setState({ status: 'ready' });
  collectionId = dispatch('createCollection', { name: 'Books' });
  title = doc().collections[collectionId]!.primaryFieldId;
  pages = dispatch('createField', { collectionId, name: 'Pages', type: 'number' });
  ids = ['One', 'Two', 'Three'].map((t) => {
    vi.advanceTimersByTime(1000); // creation order is the table's order
    return dispatch('createRecord', { collectionId, values: { [title]: t } });
  });
  window.location.hash = `#/c/${collectionId}`;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  tableStore.setState({
    cursor: null,
    anchor: null,
    editing: null,
    selected: new Set(),
    panelOpen: false,
  });
  docStore.getState().unload();
});

const value = (id: Id, field: Id) => getRecord(doc(), collectionId, id)?.values[field];

describe('table', () => {
  it('moves with the keyboard and saves typed values', async () => {
    render(<App />);
    const grid = await screen.findByRole('grid');
    act(() => {
      grid.focus();
    });
    fireEvent.keyDown(grid, { key: 'ArrowDown' }); // selects the first cell
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: '4' }); // typing starts editing
    const input = await screen.findByRole('textbox', { name: 'Pages' });
    await userEvent.type(input, '20{Enter}');
    expect(value(ids[0]!, pages)).toBe(420);
    expect(document.activeElement).toBe(grid);

    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'x' });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Pages' }), '{Enter}');
    expect(value(ids[1]!, pages)).toBeUndefined(); // "x" isn't a number: not saved
  });

  it('pastes rows from a spreadsheet, adding records', async () => {
    render(<App />);
    const grid = await screen.findByRole('grid');
    act(() => {
      grid.focus();
    });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' }); // third row, title
    fireEvent.paste(grid, {
      clipboardData: { getData: () => 'Third\t300\nFourth\t400\n' },
    });
    expect(value(ids[2]!, title)).toBe('Third');
    expect(value(ids[2]!, pages)).toBe(300);
    const all = [...iterateRecords(doc(), collectionId)];
    expect(all).toHaveLength(4);
    expect(all.find((r) => r.values[title] === 'Fourth')?.values[pages]).toBe(400);
  });

  it('opens the record panel with Space', async () => {
    render(<App />);
    const grid = await screen.findByRole('grid');
    act(() => {
      grid.focus();
    });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: ' ', code: 'Space' });
    const panel = await screen.findByRole('complementary', { name: 'Record' });
    expect(within(panel).getByText('One')).toBeInTheDocument();
  });
});
