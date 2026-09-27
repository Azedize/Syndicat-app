/**
 * Upload content verification by file signature ("magic bytes").
 *
 * The client-declared MIME type and file name are untrusted: an upload is
 * accepted only if its bytes match an allowed format, and the stored
 * extension / content type are derived from the detected format, never from
 * the client's file name.
 */

export interface DetectedFileType {
  mime: string;
  ext: string;
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length &&
  bytes.every((b, i) => buf[offset + i] === b);

const ascii = (buf: Buffer, start: number, end: number) =>
  buf.length >= end ? buf.toString("ascii", start, end) : "";

/** Office Open XML containers are ZIP files; the declared type picks the flavour. */
const OOXML_BY_MIME: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
};

/** Legacy Office formats share the OLE2 compound-file signature. */
const OLE_BY_MIME: Record<string, string> = {
  "application/msword": ".doc",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.ms-powerpoint": ".ppt",
};

function isPlainText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the verified type of `buf`, or null when the content does not match
 * the declared MIME type (or is not an allowed format at all).
 */
export function verifyFileSignature(
  buf: Buffer,
  declaredMime: string,
): DetectedFileType | null {
  const declared = declaredMime.toLowerCase();

  if (startsWith(buf, [0xff, 0xd8, 0xff])) {
    return declared.startsWith("image/") ? { mime: "image/jpeg", ext: ".jpg" } : null;
  }
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return declared.startsWith("image/") ? { mime: "image/png", ext: ".png" } : null;
  }
  if (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a") {
    return declared.startsWith("image/") ? { mime: "image/gif", ext: ".gif" } : null;
  }
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") {
    return declared.startsWith("image/") ? { mime: "image/webp", ext: ".webp" } : null;
  }
  if (ascii(buf, 0, 5) === "%PDF-") {
    return declared === "application/pdf" ? { mime: "application/pdf", ext: ".pdf" } : null;
  }
  // ISO base media (ftyp box): HEIC/HEIF/AVIF images, MP4/MOV videos
  if (ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12).toLowerCase();
    if (brand === "avif" || brand === "avis") {
      return declared.startsWith("image/") ? { mime: "image/avif", ext: ".avif" } : null;
    }
    if (brand.startsWith("hei") || brand.startsWith("hev") || brand === "mif1" || brand === "msf1") {
      return declared.startsWith("image/") ? { mime: "image/heic", ext: ".heic" } : null;
    }
    if (brand === "qt  ") {
      return declared.startsWith("video/") ? { mime: "video/quicktime", ext: ".mov" } : null;
    }
    return declared.startsWith("video/") ? { mime: "video/mp4", ext: ".mp4" } : null;
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    if (OOXML_BY_MIME[declared]) return { mime: declared, ext: OOXML_BY_MIME[declared] };
    if (declared === "application/zip" || declared === "application/x-zip-compressed") {
      return { mime: "application/zip", ext: ".zip" };
    }
    return null;
  }
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return OLE_BY_MIME[declared] ? { mime: declared, ext: OLE_BY_MIME[declared] } : null;
  }
  // Text formats have no signature: accept only valid UTF-8 without NUL bytes.
  if ((declared === "text/plain" || declared === "text/csv") && isPlainText(buf)) {
    return declared === "text/csv"
      ? { mime: "text/csv", ext: ".csv" }
      : { mime: "text/plain", ext: ".txt" };
  }
  return null;
}
