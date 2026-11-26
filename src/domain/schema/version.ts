/** Identifies an Ostracon data file (plaintext). */
export const FILE_FORMAT = 'ostracon';
/** Identifies an encrypted Ostracon envelope (see `persistence/codec/crypto.ts`). */
export const ENCRYPTED_FORMAT = 'ostracon-encrypted';

/**
 * The schema version this build reads and writes. Bump it together with a new
 * migration in `migrations/` and a fixture in `fixtures/`.
 *
 * v1 is still in development (Phase 1 fleshes out field configs and views) and may change
 * without a migration until it is frozen at the end of Phase 1.
 */
export const CURRENT_SCHEMA_VERSION = 1;
