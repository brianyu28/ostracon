/** Identifies an Ostraca data file (plaintext). */
export const FILE_FORMAT = 'ostraca';
/** Identifies a file written before the app was renamed from Ostracon (schema v3 and earlier). */
export const LEGACY_FILE_FORMAT = 'ostracon';
/** Identifies an encrypted Ostraca envelope (see `persistence/codec/crypto.ts`). */
export const ENCRYPTED_FORMAT = 'ostraca-encrypted';
/** An encrypted envelope written before the rename. Still read, never written. */
export const LEGACY_ENCRYPTED_FORMAT = 'ostracon-encrypted';
/** Every encrypted envelope format this build can read. */
export const ENCRYPTED_FORMATS: readonly string[] = [ENCRYPTED_FORMAT, LEGACY_ENCRYPTED_FORMAT];

/**
 * The schema version this build reads and writes. Bump it together with a new
 * migration in `migrations/` and a fixture in `fixtures/`.
 *
 * v1 is released: never change a released schema in place (see docs/ARCHITECTURE.md §5).
 */
export const CURRENT_SCHEMA_VERSION = 4;
