import "server-only";
import sharp from "sharp";

export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MIN_SHORT_SIDE = 400;
export const MAX_LONG_SIDE_INPUT = 12_000;
const MAX_INPUT_PIXELS = 60_000_000; // decompression-bomb guard
const NORMALISED_LONG_SIDE = 2048;

const FORMAT_TO_MIME: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export class ImageRejected extends Error {
  constructor(
    public reason: "type" | "size" | "decode" | "mismatch" | "dimensions",
    message: string,
  ) {
    super(message);
  }
}

export const UPLOAD_ERROR_MESSAGES: Record<ImageRejected["reason"], string> = {
  type: "Please use a JPG, PNG or WebP photo.",
  size: "That photo is over 15 MB. Try a smaller one.",
  decode: "We couldn't use this photo. Try a clearer image with your face visible.",
  mismatch: "We couldn't use this photo. Try a clearer image with your face visible.",
  dimensions: "This photo is too small. Try one at least 400 pixels wide.",
};

/**
 * Validates declared MIME, real content (magic bytes via decoder), size and dimensions,
 * then re-encodes to JPEG: applies EXIF orientation, strips all metadata (GPS etc.).
 */
export async function normaliseUpload(bytes: Buffer, declaredType: string): Promise<{ bytes: Buffer; width: number; height: number }> {
  if (!(ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(declaredType)) throw new ImageRejected("type", "unsupported declared type");
  if (bytes.length === 0) throw new ImageRejected("decode", "empty");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ImageRejected("size", "too large");

  let meta;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ImageRejected("decode", "not decodable");
  }
  const actual = meta.format ? FORMAT_TO_MIME[meta.format] : undefined;
  if (!actual) throw new ImageRejected("type", `unsupported format ${meta.format}`);
  if (actual !== declaredType) throw new ImageRejected("mismatch", `declared ${declaredType} but is ${actual}`);
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (Math.min(w, h) < MIN_SHORT_SIDE || Math.max(w, h) > MAX_LONG_SIDE_INPUT) throw new ImageRejected("dimensions", `${w}x${h}`);

  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: NORMALISED_LONG_SIDE, height: NORMALISED_LONG_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    throw new ImageRejected("decode", "re-encode failed");
  }
}

/** Validates a provider output before it is stored. */
export async function inspectOutput(bytes: Buffer): Promise<{ contentType: string; ext: string }> {
  if (bytes.length === 0 || bytes.length > 30 * 1024 * 1024) throw new Error("output size out of range");
  const text = bytes.subarray(0, 200).toString("utf8");
  if (text.trimStart().startsWith("<svg")) return { contentType: "image/svg+xml", ext: "svg" }; // mock provider only
  const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const contentType = meta.format ? FORMAT_TO_MIME[meta.format] : undefined;
  if (!contentType) throw new Error(`unsupported output format ${meta.format}`);
  return { contentType, ext: meta.format === "jpeg" ? "jpg" : meta.format! };
}

export function toDataUri(bytes: Buffer, contentType: string) {
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}
