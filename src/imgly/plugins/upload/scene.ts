/**
 * Build the editor's initial scene from the uploaded File.
 *
 * The Translate flow's outputs (see translate/pages.ts:appendTranslatedPage)
 * have the structure: page → graphic block with image fill (page itself
 * unstyled). We mirror that structure for the source image so:
 *
 *   - the Translate panel's selection predicate (pickImageFillBlock) has
 *     a child block to find — it explicitly rejects the page itself.
 *   - source and translated pages share the same shape in the document
 *     tree.
 *
 * Building from `engine.scene.create('Free', { page: { size: ... } })`
 * directly is tricky: page dimensions get interpreted in the scene's
 * design unit (which defaults to something other than pixel), so passing
 * the image's natural pixel dimensions sized the page wildly off and the
 * graphic block landed outside it. Instead we delegate the page setup to
 * `engine.scene.createFromImage`, which already does the dpi / unit /
 * camera arithmetic correctly, then graft our own graphic-block child on
 * top and disable the page's own image fill.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export async function loadImageIntoScene(
  cesdk: CreativeEditorSDK,
  file: File
): Promise<void> {
  const engine = cesdk.engine;

  const url = URL.createObjectURL(file);
  try {
    // Let CE.SDK handle the page sizing, design unit, and camera framing.
    await engine.scene.createFromImage(url);

    const [page] = engine.scene.getPages();
    if (page == null) {
      throw new Error('engine.scene.createFromImage did not produce a page.');
    }

    const pageWidth = engine.block.getFrameWidth(page);
    const pageHeight = engine.block.getFrameHeight(page);

    // Stage the file bytes as a buffer:// URI on the engine — same
    // approach appendTranslatedPage uses, so source and translated
    // graphic blocks have identically structured fills.
    const bufferUri = engine.editor.createBuffer();
    const arrayBuffer = await file.arrayBuffer();
    engine.editor.setBufferData(bufferUri, 0, new Uint8Array(arrayBuffer));

    // Create a graphic block on the page, sized to the page.
    const imageBlock = engine.block.create('graphic');
    engine.block.setShape(imageBlock, engine.block.createShape('rect'));
    const fill = engine.block.createFill('image');
    engine.block.setSourceSet(fill, 'fill/image/sourceSet', [
      { uri: bufferUri, width: pageWidth, height: pageHeight }
    ]);
    engine.block.setFill(imageBlock, fill);

    engine.block.setPositionXMode(imageBlock, 'Absolute');
    engine.block.setPositionYMode(imageBlock, 'Absolute');
    engine.block.setWidthMode(imageBlock, 'Absolute');
    engine.block.setHeightMode(imageBlock, 'Absolute');
    engine.block.setPositionX(imageBlock, 0);
    engine.block.setPositionY(imageBlock, 0);
    engine.block.setWidth(imageBlock, pageWidth);
    engine.block.setHeight(imageBlock, pageHeight);

    engine.block.appendChild(page, imageBlock);

    // Translated pages don't have a page-level image fill — only their
    // graphic block does. Disable the page's image fill so the source
    // page has the same render path. Visually identical: the graphic
    // block fully covers the page.
    engine.block.setFillEnabled(page, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}
