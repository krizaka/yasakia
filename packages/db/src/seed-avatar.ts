import zlib from "node:zlib";

import { encode } from "blurhash";

/**
 * Generated avatars for the development seed — geometric, clearly not a person (no real photo ever enters the
 * development data). A PNG is written by hand (zlib + CRC-32): no image library is needed to seed.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An RGBA pixel buffer as a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // no filter
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

type Rgb = [number, number, number];

/** A diagonal two-tone background and a disc — the same seed always draws the same avatar. */
export function avatarPixels(size: number, from: Rgb, to: Rgb, disc: Rgb): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      const inDisc = (x - center) ** 2 + (y - center * 0.9) ** 2 < (size * 0.28) ** 2;
      const color = inDisc ? disc : (from.map((c, i) => Math.round(c + (to[i] - c) * t)) as Rgb);
      const at = (y * size + x) * 4;
      pixels[at] = color[0];
      pixels[at + 1] = color[1];
      pixels[at + 2] = color[2];
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

export interface GeneratedAvatar {
  png: Buffer;
  width: number;
  height: number;
  blurhash: string;
}

export function generateAvatar(from: Rgb, to: Rgb, disc: Rgb, size = 256): GeneratedAvatar {
  const pixels = avatarPixels(size, from, to, disc);
  const small = 32;
  const thumb = avatarPixels(small, from, to, disc);
  return { png: encodePng(size, size, pixels), width: size, height: size, blurhash: encode(thumb, small, small, 4, 4) };
}
