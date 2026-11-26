import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { iterateRecords } from '@/domain/model';
import { createEmptyDocument } from '@/domain/schema/defaults';
import type { FieldOf, Id } from '@/domain/schema/types';
import { docStore } from '@/store/docStore';
import { sessionStore } from '@/store/sessionStore';
import { ui, uiStore } from '@/store/uiStore';

const doc = () => docStore.getState().doc!;
const dispatch = docStore.getState().dispatch;
let collectionId: Id;

beforeEach(() => {
  window.location.hash = '';
  docStore.getState().load(createEmptyDocument({ appVersion: 'test' }));
  sessionStore.setState({ status: 'ready' });
  collectionId = docStore.getState().dispatch('createCollection', { name: 'Books' });
});
afterEach(() => {
  uiStore.setState({ fieldEditor: null, collectionSettings: null, newCollectionOpen: false });
  docStore.getState().unload();
});

function fieldNamed(name: string) {
  return Object.values(doc().fields).find(
    (f) => f.collectionId === collectionId && f.name === name,
  );
}

describe('field editor', () => {
  it('adds a select field with options', async () => {
    render(<App />);
    act(() => {
      ui.openFieldEditor({ collectionId });
    });
    const dialog = await screen.findByRole('dialog', { name: 'Add field' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Status');
    await userEvent.click(within(dialog).getByLabelText('Type'));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Single select', hidden: true }),
    );
    const newOption = within(dialog).getByLabelText('New option name');
    await userEvent.type(newOption, 'To read{Enter}');
    await userEvent.type(newOption, 'Read{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));

    const field = fieldNamed('Status') as FieldOf<'singleSelect'> | undefined;
    expect(field?.type).toBe('singleSelect');
    expect(field?.config.options.map((o) => o.name)).toEqual(['To read', 'Read']);
  });

  it('previews a type change and converts the values when saved', async () => {
    const pages = dispatch('createField', { collectionId, name: 'Pages', type: 'text' });
    for (const v of ['120', '300', 'long'])
      dispatch('createRecord', { collectionId, values: { [pages]: v } });
    render(<App />);
    act(() => {
      ui.openFieldEditor({ collectionId, fieldId: pages });
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit field' });
    await userEvent.click(within(dialog).getByLabelText('Type'));
    await userEvent.click(await screen.findByRole('option', { name: 'Number', hidden: true }));
    expect(within(dialog).getByText(/2 values will convert to number/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 value can’t be converted/)).toBeInTheDocument();
    expect(within(dialog).getByText(/“long”/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(doc().fields[pages]?.type).toBe('number');
    const values = [...iterateRecords(doc(), collectionId)].map((r) => r.values[pages]);
    expect(values.sort()).toEqual([120, 300, undefined]);
  });

  it('closes after saving a rename (a command that returns nothing)', async () => {
    const author = dispatch('createField', { collectionId, name: 'Author', type: 'text' });
    render(<App />);
    act(() => {
      ui.openFieldEditor({ collectionId, fieldId: author });
    });
    const dialog = await screen.findByRole('dialog', { name: 'Edit field' });
    const name = within(dialog).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Writer{Enter}');
    expect(doc().fields[author]?.name).toBe('Writer');
    expect(uiStore.getState().fieldEditor).toBeNull();
  });
});

describe('collection settings', () => {
  it('reorders fields and changes the primary field', async () => {
    const title = dispatch('createField', { collectionId, name: 'Title', type: 'text' });
    render(<App />);
    act(() => {
      ui.openCollectionSettings(collectionId, 'fields');
    });
    const dialog = await screen.findByRole('dialog', { name: 'Books settings' });
    const actions = within(dialog).getByRole('button', { name: 'Actions for Title' });
    await userEvent.click(actions);
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Make primary', hidden: true }),
    );
    expect(doc().collections[collectionId]?.primaryFieldId).toBe(title);
  });
});
