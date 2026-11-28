// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decryptFile,
  deriveKey,
  encryptFile,
  randomSalt,
  readEnvelope,
  WrongPassphraseError,
} from './crypto';

const ITER = 1000; // fast for tests; the app uses 600,000

describe('file encryption', () => {
  it('round-trips with the right passphrase and a fresh IV each time', async () => {
    const salt = randomSalt();
    const info = { key: await deriveKey('correct horse', salt, ITER), salt, iterations: ITER };
    const plain = new TextEncoder().encode('{"format":"ostraca"}');
    const a = await encryptFile(plain, 'fil_abc', info);
    const b = await encryptFile(plain, 'fil_abc', info);
    const envA = readEnvelope(a)!;
    expect(envA.fileId).toBe('fil_abc');
    expect(envA.cipher.iv).not.toBe(readEnvelope(b)!.cipher.iv);
    expect(new TextDecoder().decode(await decryptFile(envA, info.key))).toBe(
      '{"format":"ostraca"}',
    );
    // A key derived again from the same passphrase and the file's salt works.
    const again = await deriveKey('correct horse', salt, ITER);
    await expect(decryptFile(envA, again)).resolves.toBeDefined();
  });

  it('rejects a wrong passphrase and tampering (including a swapped file id)', async () => {
    const salt = randomSalt();
    const info = { key: await deriveKey('right', salt, ITER), salt, iterations: ITER };
    const env = readEnvelope(await encryptFile(new Uint8Array([1, 2, 3]), 'fil_abc', info))!;
    await expect(decryptFile(env, await deriveKey('wrong', salt, ITER))).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    await expect(decryptFile({ ...env, fileId: 'fil_other' }, info.key)).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it('ignores plaintext files', () => {
    expect(
      readEnvelope(new TextEncoder().encode('{"format":"ostraca","schemaVersion":2}')),
    ).toBeNull();
  });

  it('refuses malformed envelopes and unreasonable key-derivation costs', async () => {
    const salt = randomSalt();
    const info = { key: await deriveKey('right', salt, ITER), salt, iterations: ITER };
    const env = readEnvelope(await encryptFile(new Uint8Array([1]), 'fil_abc', info))!;
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    expect(() => readEnvelope(encode({ ...env, kdf: { ...env.kdf, iterations: 1e12 } }))).toThrow(
      /damaged/,
    );
    expect(() => readEnvelope(encode({ ...env, cipher: null }))).toThrow(/damaged/);
  });

  it('reads envelopes written before the rename, and saves them in the new format', async () => {
    const salt = randomSalt();
    const info = { key: await deriveKey('right', salt, ITER), salt, iterations: ITER };
    const current = readEnvelope(await encryptFile(new Uint8Array([7, 8]), 'fil_abc', info))!;
    expect(current.format).toBe('ostraca-encrypted');
    // An old app authenticated its own format string ("ostracon-encrypted") with the file id.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode('ostracon-encrypted:1:fil_abc'),
      },
      info.key,
      new Uint8Array([7, 8]),
    );
    const legacyBytes = new TextEncoder().encode(
      JSON.stringify({
        ...current,
        format: 'ostracon-encrypted',
        cipher: { name: 'AES-GCM', iv: btoa(String.fromCharCode(...iv)) },
        payload: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
      }),
    );
    const legacy = readEnvelope(legacyBytes)!;
    expect(legacy.format).toBe('ostracon-encrypted');
    expect([...(await decryptFile(legacy, info.key))]).toEqual([7, 8]);
    // The format is authenticated: relabelling either envelope fails to decrypt.
    await expect(
      decryptFile({ ...legacy, format: 'ostraca-encrypted' }, info.key),
    ).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(
      decryptFile({ ...current, format: 'ostracon-encrypted' }, info.key),
    ).rejects.toBeInstanceOf(WrongPassphraseError);
  });
});
