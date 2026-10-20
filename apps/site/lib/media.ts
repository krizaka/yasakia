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
  fr: {
    hero: { webm: "18eacd86ae", mp4: "50fb2b4010", jpg: "9f078f91d5" },
    photos: { webm: "2153b3abd3", mp4: "231f593c13", jpg: "9f078f91d5" },
    talk: { webm: "765dbae8aa", mp4: "f84857aede", jpg: "2c5d196584" },
    batch: { webm: "83bff00d3e", mp4: "221ea3cd24", jpg: "e5d94cb384" },
    write: { webm: "3fef90b739", mp4: "76e94b5d74", jpg: "9b35369b4e" },
    media: { webm: "5b138b21e1", mp4: "19cae52782", jpg: "0459686b99" },
    /** The whole run, uncut (the demo page). */
    full: { webm: "577ef43972", mp4: "50e878895b", jpg: "36cd91221f" },
  },
  en: {
    hero: { webm: "49347fa7e1", mp4: "54d9fd48b3", jpg: "6d4e9ab137" },
    photos: { webm: "d1c32ae3f7", mp4: "cdbdb6b4a9", jpg: "6d4e9ab137" },
    talk: { webm: "32b8403bce", mp4: "ef4ede3a10", jpg: "21dc365f2d" },
    batch: { webm: "36d93c47ed", mp4: "d272de72dc", jpg: "86ade6f30f" },
    write: { webm: "c27d4d30b0", mp4: "605bd57689", jpg: "cc526418a9" },
    media: { webm: "de1ea231a3", mp4: "ca6088d52c", jpg: "1da5a0c7a5" },
    full: { webm: "400cce369c", mp4: "5b95752836", jpg: "3f6475dd81" },
  },
} as const;

export type TakeId = keyof (typeof TAKES)["fr"];

/** The take in the reader's language: the screens of the recording are in that language (French files `take-<id>`, English `take-en-<id>`). */
export const take = (id: TakeId, locale: "en" | "fr") => {
  const name = locale === "en" ? `take-en-${id}` : `take-${id}`;
  const h = TAKES[locale][id];
  return { webm: `${CDN}/${name}.${h.webm}.webm`, mp4: `${CDN}/${name}.${h.mp4}.mp4`, poster: `${CDN}/${name}.${h.jpg}.jpg` };
};
