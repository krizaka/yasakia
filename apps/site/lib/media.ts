/**
 * Yasakia's recordings — Krizaka's media live on Bunny (never in this repository), under the product's own folder of the
 * layout: `site/products/yasakia/tour/<name>.<hash>.<ext>`, the hash is the file's (a URL never changes content). The
 * recordings are made by `npm run dev:journey` on the real development site; the request ids of the run are in the pull
 * request that published them. A new recording replaces the old one: its hashes are changed here and the old files pruned.
 */
const CDN = "https://krizaka-assets.b-cdn.net/site/products/yasakia/tour";

/** The two recordings of the journey and the hashes of their files. */
export const CLIPS = {
  talk: { webm: "8830c624d5", mp4: "4b648cf8ea", jpg: "a73c38309c" },
  batch: { webm: "7861c4cb41", mp4: "561bd30f2e", jpg: "ba0817c377" },
} as const;

export type ClipId = keyof typeof CLIPS;

export const clip = (id: ClipId) => ({
  webm: `${CDN}/${id}.${CLIPS[id].webm}.webm`,
  mp4: `${CDN}/${id}.${CLIPS[id].mp4}.mp4`,
  poster: `${CDN}/${id}.${CLIPS[id].jpg}.jpg`,
});
