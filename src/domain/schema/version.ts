/** Identifies an Ostracon data file (plaintext). */
export const FILE_FORMAT = 'ostracon';
/** Identifies an encrypted Ostracon envelope (see `persistence/codec/crypto.ts`). */
export const ENCRYPTED_FORMAT = 'ostracon-encrypted';

/**
 * The schema version this build reads and writes. Bump it together with a new
 * migration in `migrations/` and a fixture in `fixtures/`.
 *
 * v1 is released: never change a released schema in place (see docs/ARCHITECTURE.md §5).
 */
export const CURRENT_SCHEMA_VERSION = 1;
