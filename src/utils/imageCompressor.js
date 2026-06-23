/**
 * @file imageCompressor.js
 * @description Image compression and EXIF GPS extraction utilities for CrisisMap.
 *
 * Uses the HTML5 Canvas API to resize and compress images before upload,
 * keeping payloads small on mobile networks. Includes a lightweight EXIF
 * parser to extract GPS coordinates directly from photo metadata.
 */

/**
 * Compress an image file by resizing it and re-encoding as JPEG.
 * Preserves aspect ratio and never up-scales images smaller than maxWidth.
 *
 * @param {File|Blob} file - The source image file.
 * @param {number} [maxWidth=1200] - Maximum width in pixels.
 * @param {number} [quality=0.7] - JPEG quality (0.0 – 1.0).
 * @returns {Promise<Blob>} Compressed JPEG blob.
 */
export async function compressImage(file, maxWidth = 1200, quality = 0.7) {
  if (!(file instanceof Blob)) {
    throw new TypeError('compressImage expects a File or Blob.');
  }

  const imageBitmap = await createImageBitmap(file);
  const { width: origW, height: origH } = imageBitmap;

  // Calculate new dimensions, preserving aspect ratio
  let newWidth = origW;
  let newHeight = origH;

  if (origW > maxWidth) {
    const ratio = maxWidth / origW;
    newWidth = maxWidth;
    newHeight = Math.round(origH * ratio);
  }

  // Draw to an offscreen canvas
  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
  imageBitmap.close();

  // Encode to JPEG blob
  const compressedBlob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality
  });

  return compressedBlob;
}

// ─── EXIF GPS Extraction ─────────────────────────────────────────────────────
// Lightweight parser — reads only what we need (GPS IFD) without pulling in
// a full EXIF library.

/**
 * Attempt to extract GPS latitude / longitude from an image file's EXIF data.
 *
 * @param {File|Blob} file - A JPEG image that may contain EXIF GPS tags.
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 *   Resolved coordinates or null if GPS data is absent or unreadable.
 */
export async function extractExifGPS(file) {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // JPEG must start with 0xFFD8
    if (view.getUint16(0) !== 0xffd8) return null;

    const exifStart = findExifStart(view);
    if (exifStart === -1) return null;

    // TIFF header sits right after the "Exif\0\0" marker
    const tiffOffset = exifStart + 6;
    const littleEndian = view.getUint16(tiffOffset) === 0x4949; // 'II'

    const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
    const gpsIfdPointer = findGPSIFDPointer(
      view,
      tiffOffset,
      tiffOffset + ifdOffset,
      littleEndian
    );
    if (gpsIfdPointer === null) return null;

    return readGPSData(view, tiffOffset, gpsIfdPointer, littleEndian);
  } catch (err) {
    console.warn('[CrisisMap] EXIF GPS extraction failed:', err);
    return null;
  }
}

// ── Internal helpers ──

/**
 * Scan JPEG markers to find the APP1 (EXIF) segment.
 * @param {DataView} view
 * @returns {number} Byte offset of the Exif data, or -1
 */
function findExifStart(view) {
  let offset = 2; // skip SOI marker
  const length = view.byteLength;

  while (offset < length - 1) {
    const marker = view.getUint16(offset);
    if (marker === 0xffe1) {
      // APP1 — verify "Exif\0\0" string
      const exifHeader = view.getUint32(offset + 4);
      if (exifHeader === 0x45786966) return offset + 4; // 'Exif'
    }
    // Move to the next marker (skip marker length)
    const segmentLength = view.getUint16(offset + 2);
    offset += 2 + segmentLength;
  }
  return -1;
}

/**
 * Walk IFD0 entries to find the GPS IFD pointer (tag 0x8825).
 * @param {DataView} view
 * @param {number} tiffOffset
 * @param {number} ifdStart
 * @param {boolean} le - little-endian flag
 * @returns {number|null}
 */
function findGPSIFDPointer(view, tiffOffset, ifdStart, le) {
  const entryCount = view.getUint16(ifdStart, le);

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdStart + 2 + i * 12;
    const tag = view.getUint16(entryOffset, le);
    if (tag === 0x8825) {
      return view.getUint32(entryOffset + 8, le);
    }
  }
  return null;
}

/**
 * Read GPS latitude and longitude from the GPS IFD.
 * @param {DataView} view
 * @param {number} tiffOffset
 * @param {number} gpsOffset - Offset from TIFF start
 * @param {boolean} le
 * @returns {{latitude: number, longitude: number} | null}
 */
function readGPSData(view, tiffOffset, gpsOffset, le) {
  const absOffset = tiffOffset + gpsOffset;
  const entries = view.getUint16(absOffset, le);

  let latRef = null;
  let lonRef = null;
  let latValues = null;
  let lonValues = null;

  for (let i = 0; i < entries; i++) {
    const entryOffset = absOffset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, le);
    const valueOffset = view.getUint32(entryOffset + 8, le);

    switch (tag) {
      case 1: // GPSLatitudeRef ('N' or 'S')
        latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 2: // GPSLatitude (3 rationals)
        latValues = readRationals(view, tiffOffset + valueOffset, 3, le);
        break;
      case 3: // GPSLongitudeRef ('E' or 'W')
        lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 4: // GPSLongitude (3 rationals)
        lonValues = readRationals(view, tiffOffset + valueOffset, 3, le);
        break;
    }
  }

  if (!latValues || !lonValues) return null;

  let latitude = dmsToDecimal(latValues);
  let longitude = dmsToDecimal(lonValues);

  if (latRef === 'S') latitude = -latitude;
  if (lonRef === 'W') longitude = -longitude;

  return { latitude, longitude };
}

/**
 * Read `count` TIFF rationals (pairs of uint32) starting at `offset`.
 * @param {DataView} view
 * @param {number} offset
 * @param {number} count
 * @param {boolean} le
 * @returns {number[]} Array of rational values (numerator / denominator)
 */
function readRationals(view, offset, count, le) {
  const values = [];
  for (let i = 0; i < count; i++) {
    const num = view.getUint32(offset + i * 8, le);
    const den = view.getUint32(offset + i * 8 + 4, le);
    values.push(den === 0 ? 0 : num / den);
  }
  return values;
}

/**
 * Convert [degrees, minutes, seconds] to decimal degrees.
 * @param {number[]} dms
 * @returns {number}
 */
function dmsToDecimal([deg, min, sec]) {
  return deg + min / 60 + sec / 3600;
}
