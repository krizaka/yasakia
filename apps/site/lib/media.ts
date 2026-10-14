/** The demo clip — Krizaka's media live on Bunny (never in this repository): `<name>.<hash>.<ext>`, the hash is the file's. */
const CDN = "https://krizaka-assets.b-cdn.net/site/home/kit-native";

export type Theme = "dark" | "light";

const HASHES = {
  dark: { webm: "8013cd3776", mp4: "4b17fb8bf7", jpg: "bee1f7c4bc" },
  light: { webm: "0427641297", mp4: "52f8070fd6", jpg: "a5049f2b80" },
} as const;

export const clip = (theme: Theme) => ({
  webm: `${CDN}/yasakia-${theme}.${HASHES[theme].webm}.webm`,
  mp4: `${CDN}/yasakia-${theme}.${HASHES[theme].mp4}.mp4`,
  poster: `${CDN}/yasakia-${theme}.${HASHES[theme].jpg}.jpg`,
});
