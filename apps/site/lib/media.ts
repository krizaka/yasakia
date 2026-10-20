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
    hero: { webm: "b9418f789f", mp4: "a798788c96", jpg: "872b2c3706" },
    photos: { webm: "fb9144cd1d", mp4: "7a94bb8fcd", jpg: "872b2c3706" },
    talk: { webm: "a88a2129e6", mp4: "f3bc8181f8", jpg: "4c0d1776dc" },
    batch: { webm: "d501601de5", mp4: "70ee878fae", jpg: "c3b24cc1dc" },
    write: { webm: "4c38b432f7", mp4: "b74724543a", jpg: "c6f5d63089" },
    media: { webm: "2daceae2ca", mp4: "f26110acd8", jpg: "f1870a518f" },
    /** The whole run, uncut (the demo page). */
    full: { webm: "2c0f95f469", mp4: "7273beac05", jpg: "9ce11180e7" },
  },
  en: {
    hero: { webm: "ae936f206f", mp4: "e854bbea38", jpg: "030186018d" },
    photos: { webm: "73659001ae", mp4: "461fe79386", jpg: "030186018d" },
    talk: { webm: "e578ac448e", mp4: "5ee66d86c4", jpg: "c31291a5cc" },
    batch: { webm: "f5f9b50ee3", mp4: "85f421cff0", jpg: "4dd1549023" },
    write: { webm: "74c4b2c800", mp4: "d647f9014a", jpg: "d87e1212e0" },
    media: { webm: "425f0d439f", mp4: "30554ad140", jpg: "01e84d9f16" },
    full: { webm: "eaa55f5139", mp4: "a1ca481d3f", jpg: "deb04c4e8a" },
  },
} as const;

export type TakeId = keyof (typeof TAKES)["fr"];

/** The take in the reader's language: the screens of the recording are in that language (French files `take-<id>`, English `take-en-<id>`). */
export const take = (id: TakeId, locale: "en" | "fr") => {
  const name = locale === "en" ? `take-en-${id}` : `take-${id}`;
  const h = TAKES[locale][id];
  return { webm: `${CDN}/${name}.${h.webm}.webm`, mp4: `${CDN}/${name}.${h.mp4}.mp4`, poster: `${CDN}/${name}.${h.jpg}.jpg` };
};
