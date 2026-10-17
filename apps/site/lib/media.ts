/**
 * Yasakia's recordings — Krizaka's media live on Bunny (never in this repository), under the product's own folder of the
 * layout: `site/products/yasakia/tour/<name>.<hash>.<ext>`, the hash is the file's (a URL never changes content). The
 * recordings are made by `npm run dev:journey` on the real development site; the request ids of the run are in the pull
 * request that published them. A new recording replaces the old one: its hashes are changed here and the old files pruned.
 */
const CDN = "https://krizaka-assets.b-cdn.net/site/products/yasakia/tour";

/** The recording of the whole loop (`npm run dev:journey -- --through loop`, 2026-10-17) and the hashes of its files. */
export const CLIPS = {
  loop: { webm: "c8320ba441", mp4: "31a8872f96", jpg: "8ad54182ce" },
} as const;

export type ClipId = keyof typeof CLIPS;

export const clip = (id: ClipId) => ({
  webm: `${CDN}/${id}.${CLIPS[id].webm}.webm`,
  mp4: `${CDN}/${id}.${CLIPS[id].mp4}.mp4`,
  poster: `${CDN}/${id}.${CLIPS[id].jpg}.jpg`,
});
