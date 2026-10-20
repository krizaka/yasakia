import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BRAND, cdnHashes, ICONS, sha256 } from "./sync-brand-icons.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Anti-drift guard: every committed icon is the CDN file of the brand, byte for byte (`node scripts/sync-brand-icons.mjs` re-downloads them).
describe(`brand icons (${BRAND})`, () => {
  it("each committed icon matches the CDN brand manifest", async () => {
    const hashes = await cdnHashes();
    for (const [file, dest] of Object.entries(ICONS)) {
      const expected = hashes[`brand/${BRAND}/${file}`];
      expect(expected, `brand/${BRAND}/${file} in the CDN manifest`).toBeTruthy();
      expect(sha256(await readFile(path.join(ROOT, dest))), dest).toBe(expected);
    }
  }, 60_000);
});
