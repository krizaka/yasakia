import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { InvalidImageError, normalisePhoto, sniffImageType } from "./images";

async function phonePhoto(width = 1200, height = 1600) {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 184, b: 166 } } })
    .withExif({ IFD0: { Make: "Phone", Model: "Test" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "45/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "73/1 35/1 0/1" } })
    .jpeg()
    .toBuffer();
}

describe("photo normalisation", () => {
  it("re-encodes to JPEG, strips every metadata block (GPS included), computes size and blurhash", async () => {
    const original = await phonePhoto();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const photo = await normalisePhoto(original, "image/jpeg");
    expect(photo.mimeType).toBe("image/jpeg");
    expect((await sharp(photo.body).metadata()).exif).toBeUndefined();
    expect(photo.body.includes(Buffer.from("Phone"))).toBe(false);
    expect([photo.width, photo.height]).toEqual([1200, 1600]);
    expect(photo.blurhash).toMatch(/^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{6,}$/);
  });

  it("caps the stored size at 2048 px", async () => {
    const photo = await normalisePhoto(await sharp({ create: { width: 4000, height: 1000, channels: 3, background: "#123456" } }).png().toBuffer(), "image/png");
    expect([photo.width, photo.height]).toEqual([2048, 512]);
  });

  it("refuses bytes that are not the declared picture", async () => {
    const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(normalisePhoto(png, "image/jpeg")).rejects.toThrow(InvalidImageError);
    await expect(normalisePhoto(Buffer.from("hello"), "image/png")).rejects.toThrow(InvalidImageError);
    await expect(normalisePhoto(png, "image/gif")).rejects.toThrow(InvalidImageError);
  });

  it("refuses a picture smaller than 64 × 64", async () => {
    const tiny = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(normalisePhoto(tiny, "image/png")).rejects.toThrow(/64/);
  });

  it("knows the three types by their magic numbers", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("RIFF0000WEBPVP8 ", "ascii"))).toBe("image/webp");
    expect(sniffImageType(Buffer.from("GIF89a"))).toBeNull();
  });
});
