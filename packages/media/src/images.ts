import { encode } from "blurhash";
import sharp, { type OutputInfo } from "sharp";

import { PHOTO_TYPES, type PhotoType, STORED_MAX_EDGE } from "./limits";

/**
 * What the API keeps of an uploaded photo: the picture re-encoded to JPEG — orientation applied, at most 2048 px, and
 * **every metadata block stripped** (EXIF GPS included: a phone's photo often carries where it was taken, and Yasakia
 * never keeps an exact position) — its size and its blurhash (the placeholder the app paints before the photo loads).
 */
export interface NormalisedPhoto {
  body: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  blurhash: string;
}

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

/** The type the bytes really are (magic numbers), whatever was declared. */
export function sniffImageType(bytes: Buffer): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Re-encodes an uploaded photo. Throws InvalidImageError when the bytes are not a supported, decodable picture. */
export async function normalisePhoto(bytes: Buffer, declared: string): Promise<NormalisedPhoto> {
  const sniffed = sniffImageType(bytes);
  if (!sniffed || !(declared in PHOTO_TYPES) || sniffed !== declared) throw new InvalidImageError("not the declared JPEG, PNG or WebP picture");
  let body: Buffer;
  let info: OutputInfo;
  try {
    ({ data: body, info } = await sharp(bytes, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: STORED_MAX_EDGE, height: STORED_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new InvalidImageError("the picture cannot be decoded");
  }
  if (info.width < 64 || info.height < 64) throw new InvalidImageError("the picture is smaller than 64 × 64");
  const thumb = await sharp(body).resize(32, 32, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const blurhash = encode(new Uint8ClampedArray(thumb.data), thumb.info.width, thumb.info.height, 4, 3);
  return { body, mimeType: "image/jpeg", width: info.width, height: info.height, blurhash };
}

/** The longest edge of the picture sent to the photo check. */
export const CHECK_THUMBNAIL_EDGE = 512;

/**
 * The picture Orazaka's photo check receives: the stored JPEG shrunk to 512 px, no metadata. Enough for a face to be found
 * and compared, far less of a person than the stored photo.
 */
export async function checkThumbnail(stored: Buffer): Promise<Buffer> {
  return sharp(stored).rotate().resize({ width: CHECK_THUMBNAIL_EDGE, height: CHECK_THUMBNAIL_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}
