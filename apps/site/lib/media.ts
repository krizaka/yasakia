/**
 * Yasakia's recordings — Krizaka's media live on Bunny (never in this repository), under the product's own folder of the
 * layout: `site/products/yasakia/tour/<name>.<hash>.<ext>`, the hash is the file's (a URL never changes content). The
 * recordings are made by `npm run dev:journey` on the real development site; the request ids of the run are in the pull
 * request that published them. A new recording replaces the old one: its hashes are changed here and the old files pruned.
 */
const CDN = "https://krizaka-assets.b-cdn.net/site/products/yasakia/tour";

/**
 * The real take (`node scripts/record-take.mjs`, then `scripts/take-clips.mjs`): Camille's run on the development site, as a phone
 * recording at 30 fps, cut into the hero's loop and one clip per step of the landing's journey. Each is `<name>.<hash>.<ext>` on Bunny.
 */
export const TAKES = {
  hero: { webm: "55beb39b86", mp4: "fc0242a7e3", jpg: "a272bb771b" },
  photos: { webm: "3827a9ba51", mp4: "c5143a381c", jpg: "a272bb771b" },
  talk: { webm: "6bd4fbe911", mp4: "73272059cd", jpg: "69ad5ec05c" },
  batch: { webm: "c4731fd1d1", mp4: "37cc27b612", jpg: "90759ee8b6" },
  write: { webm: "ff7c075c1f", mp4: "1eec8a7cc6", jpg: "7959b79ef7" },
  media: { webm: "797cbf1981", mp4: "659e82230b", jpg: "bbdf3a367f" },
  /** The whole run, uncut (the demo page). */
  full: { webm: "3e5bac6e12", mp4: "32157449b9", jpg: "da9ef95046" },
} as const;

export type TakeId = keyof typeof TAKES;

export const take = (id: TakeId) => ({
  webm: `${CDN}/take-${id}.${TAKES[id].webm}.webm`,
  mp4: `${CDN}/take-${id}.${TAKES[id].mp4}.mp4`,
  poster: `${CDN}/take-${id}.${TAKES[id].jpg}.jpg`,
});
