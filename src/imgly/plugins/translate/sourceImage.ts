/**
 * Read a source image block's *original* bytes back from the engine.
 *
 * Both translate pipelines (Direct and Magic Layers) need the source image
 * as a Blob to upload to the gateway. The naive way — `engine.block.export`
 * to PNG — re-encodes the photo losslessly, which balloons a source JPEG
 * several-fold for no quality gain. The upload path stores the user's raw
 * file as a `buffer://` URI wired into the fill's source set (see
 * upload/scene.ts), so we can hand back those exact bytes instead.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

type Engine = CreativeEditorSDK['engine'];

/**
 * Return the source block's original image bytes as a Blob with the correct
 * MIME type, or `null` if the block has no image fill, the source isn't a
 * readable engine buffer (e.g. a remote URL), or the format can't be
 * identified. Callers fall back to a PNG export in that case.
 */
export function readOriginalImageBlob(
  engine: Engine,
  block: number
): Blob | null {
  if (!engine.block.supportsFill(block)) return null;
  const fill = engine.block.getFill(block);
  if (engine.block.getType(fill) !== '//ly.img.ubq/fill/image') return null;

  const uri = engine.block.getSourceSet(fill, 'fill/image/sourceSet')[0]?.uri;
  if (uri == null) return null;

  try {
    const length = engine.editor.getBufferLength(uri);
    const bytes = engine.editor.getBufferData(uri, 0, length);
    const mimeType = sniffImageMimeType(bytes);
    if (mimeType == null) return null;
    // `bytes` is an ArrayBuffer-backed Uint8Array at runtime; the cast just
    // satisfies the DOM lib's BlobPart type (which excludes SharedArrayBuffer).
    return new Blob([bytes as unknown as BlobPart], { type: mimeType });
  } catch {
    // `uri` isn't an engine buffer (getBufferLength/Data throw) — let the
    // caller fall back to export.
    return null;
  }
}

/**
 * Identify a raster image format from its leading magic bytes. We need this
 * because the original bytes are stored as a raw engine buffer, which drops
 * the source File's MIME type — and the gateway upload needs a correct
 * content type. Returns `null` for unrecognised data.
 */
export function sniffImageMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  return null;
}
