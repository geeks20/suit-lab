export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MIN_SHORT_SIDE = 400;
const MAX_LONG_SIDE = 1280;

export const PHOTO_ERROR = "We couldn't use this photo. Try a clearer image with your face visible.";

export type PhotoCheck = { ok: true } | { ok: false; message: string };

export function checkPhotoFile(file: { type: string; size: number }): PhotoCheck {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Please use a JPG, PNG or WebP photo." };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "That photo is over 15 MB. Try a smaller one." };
  if (file.size === 0) return { ok: false, message: PHOTO_ERROR };
  return { ok: true };
}

/**
 * Decodes, validates dimensions and downsizes a photo in the browser.
 * Returns a JPEG data URL. Re-encoding also strips EXIF metadata (e.g. GPS).
 */
export async function preparePhoto(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(PHOTO_ERROR);
  }
  const { width, height } = bitmap;
  if (Math.min(width, height) < MIN_SHORT_SIDE) {
    bitmap.close();
    throw new Error("This photo is too small. Try one at least 400 pixels wide.");
  }
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(PHOTO_ERROR);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}
