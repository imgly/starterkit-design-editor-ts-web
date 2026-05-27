/**
 * Scene mutation helpers for the Translate feature.
 *
 * Pure CE.SDK side: takes a Blob, appends a new page containing only the
 * translated image. Knows nothing about LLMs or HTTP.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export interface AppendTranslatedPageArgs {
  cesdk: CreativeEditorSDK;
  /** Page that contains `sourceBlockId`. Sets the new page's dimensions. */
  sourcePageId: number;
  /** Source image block. Sets the new image block's position and size. */
  sourceBlockId: number;
  translated: Blob;
  /** Used as the new page's name (e.g. "German"). */
  label: string;
}

/**
 * Creates a new page in the same scene as `sourcePageId`, matching its
 * dimensions, and adds one image block whose position and size mirror
 * those of `sourceBlockId` on the original page. The translated Blob is
 * stored as a `buffer://` resource so it lives inside the scene (no
 * `objectURL` that would leak on reload).
 *
 * Caller is responsible for `engine.editor.addUndoStep()` after batching
 * multiple appends — we don't add one per page.
 */
export async function appendTranslatedPage(
  args: AppendTranslatedPageArgs
): Promise<void> {
  const { cesdk, sourcePageId, sourceBlockId, translated, label } = args;
  const engine = cesdk.engine;

  // 1. Read source dimensions: page for the new page itself, image block
  //    for the placed image. Keeping them separate is what makes the
  //    translated image land at the exact same spot as the original
  //    rather than getting stretched to fill the page.
  const pageWidth = engine.block.getFrameWidth(sourcePageId);
  const pageHeight = engine.block.getFrameHeight(sourcePageId);
  const blockX = engine.block.getFrameX(sourceBlockId);
  const blockY = engine.block.getFrameY(sourceBlockId);
  const blockWidth = engine.block.getFrameWidth(sourceBlockId);
  const blockHeight = engine.block.getFrameHeight(sourceBlockId);

  // 2. Find the scene and the parent of the source page (page stack /
  // scene root). The new page is appended as a sibling so it lands in
  // the document's page order.
  const parent = engine.block.getParent(sourcePageId);
  if (parent == null) {
    throw new Error('Source page has no parent — cannot append new page.');
  }

  // 3. Stage a buffer:// URI containing the PNG bytes.
  //
  // NOTE: buffer:// URIs are transient. They live inside the running
  // engine but are NOT serialized into scene exports / saves. If the user
  // saves the scene and reloads, the translated image fills will be broken.
  // For a starter-kit demo this is acceptable; to persist, upload the
  // blob to a CDN and substitute an https:// URI here.
  //
  // CE.SDK 1.75.x: createBuffer() is the correct method (not createBufferURI).
  // setBufferData requires an offset argument; there is no setMimeType on the
  // editor namespace — MIME type is inferred from the buffer content.
  const bufferUri = engine.editor.createBuffer();
  const arrayBuffer = await translated.arrayBuffer();
  engine.editor.setBufferData(bufferUri, 0, new Uint8Array(arrayBuffer));

  // 4. Create the new page block with matching page dimensions.
  const newPage = engine.block.create('page');
  engine.block.setName(newPage, label);
  engine.block.setWidth(newPage, pageWidth);
  engine.block.setHeight(newPage, pageHeight);
  engine.block.appendChild(parent, newPage);

  // 5. Create the image block, mirroring the source block's position
  //    and size on the new page.
  const imageBlock = engine.block.create('graphic');
  engine.block.setShape(imageBlock, engine.block.createShape('rect'));
  const fill = engine.block.createFill('image');
  engine.block.setSourceSet(fill, 'fill/image/sourceSet', [
    { uri: bufferUri, width: blockWidth, height: blockHeight }
  ]);
  engine.block.setFill(imageBlock, fill);

  // Ensure absolute pixel coordinates (CE.SDK's default for graphic blocks
  // today, but pinning it removes any silent breakage on future versions).
  engine.block.setPositionXMode(imageBlock, 'Absolute');
  engine.block.setPositionYMode(imageBlock, 'Absolute');
  engine.block.setWidthMode(imageBlock, 'Absolute');
  engine.block.setHeightMode(imageBlock, 'Absolute');

  engine.block.setPositionX(imageBlock, blockX);
  engine.block.setPositionY(imageBlock, blockY);
  engine.block.setWidth(imageBlock, blockWidth);
  engine.block.setHeight(imageBlock, blockHeight);

  engine.block.appendChild(newPage, imageBlock);
}
