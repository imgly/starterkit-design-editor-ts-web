/**
 * Build the editor's initial scene from the uploaded File.
 *
 * The Translate flow's outputs (see translate/pages.ts:appendTranslatedPage)
 * have the structure: page → graphic block with image fill. We mirror that
 * structure for the source image so all pages in the document share the
 * same shape — page sized to the image, one graphic block filling it.
 *
 * `cesdk.createFromImage(url)` (the obvious alternative) makes the page
 * itself carry the image fill, which is incompatible with the Translate
 * panel's selection predicate (it requires a child block with image fill,
 * not the page itself) and produces an inhomogeneous scene where the
 * source page has a different shape than the translated pages.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export async function loadImageIntoScene(
  cesdk: CreativeEditorSDK,
  file: File
): Promise<void> {
  const engine = cesdk.engine;

  const { width, height } = await readImageDimensions(file);

  // Stage the bytes inside the engine. Same buffer:// approach the
  // Translate flow uses for newly generated pages — keeps the bytes
  // attached to the scene without needing a long-lived object URL.
  const bufferUri = engine.editor.createBuffer();
  const arrayBuffer = await file.arrayBuffer();
  engine.editor.setBufferData(bufferUri, 0, new Uint8Array(arrayBuffer));

  // Create a Free-layout scene with a page sized to the image.
  const scene = engine.scene.create('Free', {
    page: { size: { width, height } }
  });

  // Find the page that scene.create just produced.
  const [page] = engine.block.getChildren(scene);
  if (page == null) {
    throw new Error('engine.scene.create did not produce a page block.');
  }

  // Create the graphic block: rect shape + image fill, sized to the page.
  const imageBlock = engine.block.create('graphic');
  engine.block.setShape(imageBlock, engine.block.createShape('rect'));
  const fill = engine.block.createFill('image');
  engine.block.setSourceSet(fill, 'fill/image/sourceSet', [
    { uri: bufferUri, width, height }
  ]);
  engine.block.setFill(imageBlock, fill);

  engine.block.setPositionXMode(imageBlock, 'Absolute');
  engine.block.setPositionYMode(imageBlock, 'Absolute');
  engine.block.setWidthMode(imageBlock, 'Absolute');
  engine.block.setHeightMode(imageBlock, 'Absolute');

  engine.block.setPositionX(imageBlock, 0);
  engine.block.setPositionY(imageBlock, 0);
  engine.block.setWidth(imageBlock, width);
  engine.block.setHeight(imageBlock, height);

  engine.block.appendChild(page, imageBlock);
}

/** Decode the file enough to read its intrinsic pixel dimensions. */
async function readImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const result = {
        width: img.naturalWidth,
        height: img.naturalHeight
      };
      URL.revokeObjectURL(url);
      if (result.width === 0 || result.height === 0) {
        reject(new Error('Image has zero width or height.'));
        return;
      }
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image for dimensions.'));
    };
    img.src = url;
  });
}
