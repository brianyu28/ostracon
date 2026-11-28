import 'fake-indexeddb/auto';
import { produce } from 'immer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commands } from '@/domain/commands';
import { newId } from '@/lib/id';
import { decodeDocument, encodeDocument, peekHeader } from '@/persistence/codec';
import type { SaveResult, StorageAdapter } from '@/persistence/types';
import { workingCopyStore } from '@/persistence/workingCopy';
import { docStore, selectIsDirty } from './docStore';
import { session, sessionStore } from './sessionStore';

/** A fake file on "disk" that other devices can also write to. */
const disk = { bytes: null as Uint8Array | null, lastModified: 0 };

function writeDisk(bytes: Uint8Array): SaveResult {
  disk.bytes = bytes;
  disk.lastModified += 1000;
  return {
    ok: true,
    version: { lastModified: disk.lastModified },
    descriptor: { kind: 'fs-access', name: 'test.ostraca.json' },
    handle: 'handle',
  };
}

const memoryAdapter: StorageAdapter = {
  kind: 'fs-access',
  capabilities: { writeBack: true },
  open: () =>
    Promise.resolve(
      disk.bytes && {
        bytes: disk.bytes,
        descriptor: { kind: 'fs-access', name: 'test.ostraca.json' },
        version: { lastModified: disk.lastModified },
        handle: 'handle',
      },
    ),
  save: (bytes, { base, force }) =>
    Promise.resolve(
      !force && disk.bytes && base.lastModified !== disk.lastModified
        ? { ok: false, reason: 'changed', remoteBytes: disk.bytes }
        : writeDisk(bytes),
    ),
  saveAs: (bytes) => Promise.resolve(writeDisk(bytes)),
};

vi.mock('@/persistence/adapters', () => ({
  adapterFor: () => memoryAdapter,
  preferredAdapter: () => memoryAdapter,
}));

const diskRevision = () => peekHeader(disk.bytes!).revision;

/** Simulates another device saving a newer revision of the same file. */
function saveFromOtherDevice() {
  const result = decodeDocument(disk.bytes!);
  if (!result.ok) throw new Error('bad disk file');
  const model = result.model;
  writeDisk(
    encodeDocument({ ...model, meta: { ...model.meta, revision: model.meta.revision + 1 } }),
  );
}

function addCollection(name = 'People') {
  docStore.getState().dispatch('createCollection', { name });
}

beforeEach(async () => {
  disk.bytes = null;
  disk.lastModified = 0;
  await session.clearLocalData();
});

describe('session', () => {
  it('creates, saves and reopens a document', async () => {
    await session.newDocument('empty');
    addCollection();
    expect(selectIsDirty(docStore.getState())).toBe(true);

    await session.save();
    expect(diskRevision()).toBe(1);
    expect(selectIsDirty(docStore.getState())).toBe(false);
    expect(sessionStore.getState().source?.name).toBe('test.ostraca.json');

    await session.close();
    expect(docStore.getState().doc).toBeNull();
    await session.open();
    expect(Object.values(docStore.getState().doc!.collections).map((a) => a.name)).toEqual([
      'People',
    ]);
  });

  it('detects a conflicting save from another device and can keep local edits', async () => {
    await session.newDocument('empty');
    await session.save();
    saveFromOtherDevice(); // disk is now revision 2
    addCollection('Local edit');

    await session.save();
    expect(sessionStore.getState().conflict).toMatchObject({ origin: 'save', remoteRevision: 2 });
    expect(diskRevision()).toBe(2); // nothing overwritten yet

    await session.resolveConflict('keep-mine');
    expect(sessionStore.getState().conflict).toBeNull();
    expect(diskRevision()).toBe(3);
    const saved = decodeDocument(disk.bytes!);
    expect(saved.ok && Object.values(saved.model.collections).map((a) => a.name)).toEqual([
      'Local edit',
    ]);
  });

  it('can take the other version instead', async () => {
    await session.newDocument('empty');
    await session.save();
    saveFromOtherDevice();
    addCollection('Local edit');
    await session.save();

    await session.resolveConflict('take-theirs');
    expect(Object.keys(docStore.getState().doc!.collections)).toEqual([]);
    expect(sessionStore.getState().baseRevision).toBe(2);
  });

  it('restores unsaved edits from the working copy on boot', async () => {
    await session.newDocument('empty');
    addCollection('Unsaved');
    await session.flush();
    expect((await workingCopyStore.load())?.dirty).toBe(true);

    docStore.getState().unload();
    sessionStore.setState({ status: 'booting', notices: [] });
    await session.boot();

    expect(sessionStore.getState().status).toBe('ready');
    expect(Object.values(docStore.getState().doc!.collections).map((a) => a.name)).toEqual([
      'Unsaved',
    ]);
    expect(selectIsDirty(docStore.getState())).toBe(true);
    expect(sessionStore.getState().notices.map((n) => n.kind)).toEqual(['restored']);
  });

  it('shows a clear error for files from a newer app version', async () => {
    disk.bytes = new TextEncoder().encode(JSON.stringify({ format: 'ostraca', schemaVersion: 99 }));
    await session.open();
    expect(sessionStore.getState().loadError?.message).toMatch(/schema version 99/);
  });
});

describe('merging', () => {
  it('merges edits from both devices when a save conflicts', async () => {
    await session.newDocument('empty');
    addCollection('Shared');
    await session.save();
    // Another device adds a collection and saves.
    const other = decodeDocument(disk.bytes!);
    if (!other.ok) throw new Error('bad disk file');
    const remote = produce(other.model, (draft) => {
      commands.createCollection.run(
        draft,
        { name: 'Remote' },
        { now: other.model.meta.createdAt, newId },
      );
    });
    writeDisk(encodeDocument({ ...remote, meta: { ...remote.meta, revision: 2 } }));
    addCollection('Local');

    await session.save();
    expect(sessionStore.getState().conflict).not.toBeNull();
    await session.resolveConflict('merge');

    expect(sessionStore.getState().conflict).toBeNull();
    expect(diskRevision()).toBe(3);
    const saved = decodeDocument(disk.bytes!);
    expect(
      saved.ok &&
        Object.values(saved.model.collections)
          .map((a) => a.name)
          .sort(),
    ).toEqual(['Local', 'Remote', 'Shared']);
    // The remote collection arrives with its primary field and default view.
    expect(sessionStore.getState().notices.find((n) => n.kind === 'merged')).toMatchObject({
      fromRemote: 3,
      conflicts: [],
    });
  });
});

describe('encryption', () => {
  it('saves encrypted and asks for the passphrase when reopened', async () => {
    await session.newDocument('empty');
    addCollection('Secret');
    await session.setPassphrase('correct horse', false);
    await session.save();
    const text = new TextDecoder().decode(disk.bytes!);
    expect(text).toContain('ostraca-encrypted');
    expect(text).not.toContain('Secret');

    await session.close();
    await session.open();
    expect(sessionStore.getState().locked).not.toBeNull();
    await expect(session.unlock('wrong passphrase', false)).rejects.toThrow(/passphrase/);
    await session.unlock('correct horse', true);
    expect(sessionStore.getState().locked).toBeNull();
    expect(sessionStore.getState().encryption).not.toBeNull();
    expect(Object.values(docStore.getState().doc!.collections).map((a) => a.name)).toEqual([
      'Secret',
    ]);

    // The remembered key opens it without asking again.
    await session.close();
    await session.open();
    expect(sessionStore.getState().locked).toBeNull();
    expect(docStore.getState().doc).not.toBeNull();
  });

  /** Simulates someone replacing the file with an unencrypted copy of the same file id. */
  function replaceWithUnencryptedCopy() {
    const doc = docStore.getState().doc!;
    writeDisk(encodeDocument({ ...doc, meta: { ...doc.meta, revision: doc.meta.revision + 5 } }));
  }

  async function answerUnencryptedCopy(pending: Promise<void>, proceed: boolean) {
    await vi.waitFor(() => {
      expect(sessionStore.getState().unencryptedCopy).not.toBeNull();
    });
    sessionStore.getState().unencryptedCopy!.resolve(proceed);
    await pending;
  }

  async function encryptedFile() {
    await session.newDocument('empty');
    addCollection('Secret');
    await session.setPassphrase('correct horse', true);
    await session.save();
  }

  it('asks before an unencrypted copy turns encryption off, and keeps it by default', async () => {
    await encryptedFile();
    replaceWithUnencryptedCopy();

    await answerUnencryptedCopy(session.open(), false);
    expect(sessionStore.getState().encryption).not.toBeNull();
    expect(sessionStore.getState().status).toBe('ready');
    // The next save puts the encrypted version back over the unencrypted copy.
    expect(selectIsDirty(docStore.getState())).toBe(true);
    await session.save();
    expect(new TextDecoder().decode(disk.bytes!)).toContain('ostraca-encrypted');
  });

  it('loads the unencrypted copy when the user confirms', async () => {
    await encryptedFile();
    replaceWithUnencryptedCopy();
    await answerUnencryptedCopy(session.open(), true);
    expect(sessionStore.getState().encryption).toBeNull();
    expect(docStore.getState().doc!.meta.revision).toBe(diskRevision());
  });

  it('asks before merging an unencrypted copy into an encrypted file', async () => {
    await encryptedFile();
    replaceWithUnencryptedCopy();
    addCollection('Local edit');
    await session.save();
    expect(sessionStore.getState().conflict).not.toBeNull();

    await answerUnencryptedCopy(session.resolveConflict('merge'), false);
    // Back to the conflict, so another option can be chosen.
    expect(sessionStore.getState().conflict).not.toBeNull();
    expect(new TextDecoder().decode(disk.bytes!)).not.toContain('ostraca-encrypted');
  });

  it('re-encrypts the local copies when encryption is turned on, and removes them on close', async () => {
    await session.newDocument('empty');
    addCollection('Secret');
    await session.save();
    const fileId = docStore.getState().doc!.meta.fileId;
    const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
    expect(text(await workingCopyStore.loadBase(fileId))).toContain('Secret');

    await session.setPassphrase('correct horse', false);
    for (const bytes of [
      await workingCopyStore.loadBase(fileId),
      (await workingCopyStore.load())?.bytes,
    ]) {
      expect(text(bytes)).toContain('ostraca-encrypted');
      expect(text(bytes)).not.toContain('Secret');
    }

    await session.close();
    expect(await workingCopyStore.loadBase(fileId)).toBeUndefined();
  });
});
