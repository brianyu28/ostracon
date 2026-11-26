/** Identifies an Ostracon data file (plaintext). */
export const FILE_FORMAT = 'ostracon';
/** Identifies an encrypted Ostracon envelope (see `persistence/codec/crypto.ts`). */
export const ENCRYPTED_FORMAT = 'ostracon-encrypted';

/**
 * The schema version this build reads and writes. Bump it together with a new
 * migration in `migrations/` and a fixture in `fixtures/`.
 *
 * Until the first web deployment v1 is edited in place (no users or real documents exist yet);
 * see docs/ARCHITECTURE.md §5.
 */
export const CURRENT_SCHEMA_VERSION = 1;
