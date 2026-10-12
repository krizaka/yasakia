import fs from "node:fs";
import path from "node:path";

/**
 * Where photo bytes live: Bunny Edge Storage (staging, production) or a local folder (development, tests). Keys are
 * built by the server (`photos/<accountId>/<photoId>.jpg`), never taken from a client. Nothing here is public: the
 * storage pull zone has token authentication on, and the local folder is served only through the signed media route.
 */
export interface MediaStorage {
  readonly driver: "bunny" | "local";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** The object, or null when it does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Removes an object; a missing one is not an error. */
  delete(key: string): Promise<void>;
}

const KEY = /^[a-z0-9][a-z0-9/_.-]{0,199}$/;

/** Refuses a key a client could have shaped (`..`, absolute paths, odd characters). */
export function checkKey(key: string): string {
  if (!KEY.test(key) || key.includes("..") || key.includes("//")) throw new Error(`invalid storage key ${key}`);
  return key;
}

export interface BunnyStorageConfig {
  zone: string;
  apiKey: string;
  /** The region's storage host (storage.bunnycdn.com, ny.storage.bunnycdn.com, …). */
  endpoint: string;
}

/** Bunny Edge Storage over its HTTP API (`AccessKey` header). */
export function bunnyStorage(config: BunnyStorageConfig, fetchImpl: typeof fetch = fetch): MediaStorage {
  const base = `https://${config.endpoint}/${config.zone}`;
  return {
    driver: "bunny",
    async put(key, body, contentType) {
      const res = await fetchImpl(`${base}/${checkKey(key)}`, {
        method: "PUT",
        headers: { AccessKey: config.apiKey, "Content-Type": contentType || "application/octet-stream" },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Bunny storage upload failed (${res.status})`);
    },
    async get(key) {
      const res = await fetchImpl(`${base}/${checkKey(key)}`, { headers: { AccessKey: config.apiKey }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Bunny storage read failed (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await fetchImpl(`${base}/${checkKey(key)}`, { method: "DELETE", headers: { AccessKey: config.apiKey }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok && res.status !== 404) throw new Error(`Bunny storage delete failed (${res.status})`);
    },
  };
}

/** A folder on this machine — development and tests only (refused in production by the app's configuration). */
export function localStorage(dir: string): MediaStorage {
  const root = path.resolve(dir);
  const fileOf = (key: string) => {
    const file = path.join(root, checkKey(key));
    if (!file.startsWith(root + path.sep)) throw new Error(`invalid storage key ${key}`);
    return file;
  };
  return {
    driver: "local",
    async put(key, body) {
      const file = fileOf(key);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, body);
    },
    async get(key) {
      try {
        return await fs.promises.readFile(fileOf(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await fs.promises.rm(fileOf(key), { force: true });
    },
  };
}

/** An in-memory storage (unit tests). */
export function memoryStorage(): MediaStorage & { readonly objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    driver: "local",
    objects,
    async put(key, body) {
      objects.set(checkKey(key), Buffer.from(body));
    },
    async get(key) {
      return objects.get(checkKey(key)) ?? null;
    },
    async delete(key) {
      objects.delete(checkKey(key));
    },
  };
}
