import crypto from "node:crypto";

/**
 * Encryption at rest of the sensitive fields (sensitive facets, report details): AES-256-GCM, a random 96-bit nonce per
 * value, and an "additional authenticated data" context that binds a sealed value to its row and column — a value
 * copied into another row or column does not open.
 *
 * The key is DATA_ENCRYPTION_KEY (32 random bytes in base64 — `npm run setup` generates one; any other string of 32+
 * characters is hashed to 32 bytes). It is mandatory in production: the server refuses to start without it
 * (apps/web/instrumentation.ts) and any seal/open throws. Rotation: put the new key in DATA_ENCRYPTION_KEY and the old
 * ones in DATA_ENCRYPTION_KEYS_PREVIOUS (comma separated) — values sealed with an old key still open, new values use the
 * new key (each value records which key sealed it).
 *
 * Format: `enc:v1:<key id>:<base64url(nonce ‖ tag ‖ ciphertext)>` — the key id is the first 8 hex characters of the
 * key's SHA-256, never the key.
 */

export const SEALED_PREFIX = "enc:v1:";

/** The development key: only outside production, so a local database works without configuration. Never secret. */
const DEVELOPMENT_KEY = "development-only-yazakia-data-encryption-key-not-a-secret";

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

type Env = Record<string, string | undefined>;

/** 32 bytes from a configured value: base64 of exactly 32 bytes as is, any other 32+ character string hashed. */
export function keyFromSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
    const raw = Buffer.from(trimmed, "base64");
    if (raw.length === 32) return raw;
  }
  if (trimmed.length < 32) throw new EncryptionKeyError("DATA_ENCRYPTION_KEY must be 32 random bytes in base64 (or 32+ characters)");
  return crypto.createHash("sha256").update(trimmed).digest();
}

const keyId = (key: Buffer) => crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);

interface Keyring {
  current: Buffer;
  byId: Map<string, Buffer>;
}

/** The keys of this environment: the current one first, then the previous ones (rotation). */
export function keyring(env: Env = process.env): Keyring {
  const configured = env.DATA_ENCRYPTION_KEY?.trim();
  if (!configured && env.NODE_ENV === "production") throw new EncryptionKeyError("DATA_ENCRYPTION_KEY is required in production");
  const current = keyFromSecret(configured || DEVELOPMENT_KEY);
  const previous = (env.DATA_ENCRYPTION_KEYS_PREVIOUS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(keyFromSecret);
  const byId = new Map<string, Buffer>();
  for (const key of [current, ...previous]) if (!byId.has(keyId(key))) byId.set(keyId(key), key);
  return { current, byId };
}

/** Whether a stored value is sealed by {@link seal}. */
export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(SEALED_PREFIX);
}

/**
 * Seals a text. `context` names where the value lives (`facets:<accountId>:<key>`, `reports:<id>:details`): the same
 * context is needed to open it.
 */
export function seal(plaintext: string, context: string, env: Env = process.env): string {
  const { current } = keyring(env);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", current, nonce);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${SEALED_PREFIX}${keyId(current)}:${Buffer.concat([nonce, cipher.getAuthTag(), body]).toString("base64url")}`;
}

/** Opens a value sealed by {@link seal} in the same context. Throws when the key, the context or the value is wrong. */
export function open(sealed: string, context: string, env: Env = process.env): string {
  if (!isSealed(sealed)) throw new EncryptionKeyError("not a sealed value");
  const [id, payload] = sealed.slice(SEALED_PREFIX.length).split(":");
  const key = keyring(env).byId.get(id ?? "");
  if (!key || !payload) throw new EncryptionKeyError("this value was sealed with a key this environment does not have");
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < 28) throw new EncryptionKeyError("sealed value too short");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Seals a JSON value (a facet's value). */
export function sealJson(value: unknown, context: string, env: Env = process.env): string {
  return seal(JSON.stringify(value), context, env);
}

export function openJson<T = unknown>(sealed: string, context: string, env: Env = process.env): T {
  return JSON.parse(open(sealed, context, env)) as T;
}
