import { LOCAL_UPLOADS_DIR } from "../../lib/file-store.js";
import fs from "fs/promises";

export async function ensureUploadsDir() {
  try {
    await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  } catch {}
}

/**
 * Detect image content-type from file magic bytes.
 * Called when the filename has no recognised extension (e.g. files uploaded
 * from Expo Web where the blob URI produces no usable extension).
 */
export function detectImageContentType(buf: Buffer): string | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  // PNG: 89 50 4E 47
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  // GIF: 47 49 46 38 (GIF8)
  if (
    buf.length >= 4 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  )
    return "image/gif";
  // WEBP: RIFF????WEBP
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  // HEIC/HEIF: ftyp box at offset 4 with "heic" or "hei" brand
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).toLowerCase();
    if (brand.startsWith("hei") || brand === "mif1" || brand === "avif")
      return "image/heic";
  }
  return null;
}
