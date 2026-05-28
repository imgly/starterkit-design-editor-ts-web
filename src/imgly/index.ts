/**
 * CE.SDK Photo Editor — Initialization Module
 *
 * Wires PhotoEditorConfig + asset sources + background removal + the custom
 * Translate plugin. The caller (src/index.ts) is responsible for creating
 * the CE.SDK instance and loading a scene (via `cesdk.createFromImage`).
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  BlurAssetSource,
  ImageColorsAssetSource,
  ColorPaletteAssetSource,
  CropPresetsAssetSource,
  EffectsAssetSource,
  FiltersAssetSource,
  PagePresetsAssetSource,
  StickerAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  UploadAssetSources,
  VectorShapeAssetSource
} from '@cesdk/cesdk-js/plugins';

import { PhotoEditorConfig } from '../../photo-editor/plugin';
import { setupBackgroundRemovalPlugin } from './plugins/background-removal';
import { setupTranslatePlugin } from './plugins/translate';
import { DEFAULT_GATEWAY_URL } from './plugins/translate/providers';

export { PhotoEditorConfig } from '../../photo-editor/plugin';
export { setupBackgroundRemovalPlugin } from './plugins/background-removal';

export interface InitPhotoEditorOpts {
  /** Click handler for the navigation-bar Back button. */
  onBack: () => void;
}

/**
 * Initialize the CE.SDK Photo Editor with this demo's configuration.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 * @param opts.onBack - Back-button handler (returns to the upload screen)
 */
export async function initPhotoEditor(
  cesdk: CreativeEditorSDK,
  opts: InitPhotoEditorOpts
): Promise<void> {
  // Configuration plugin (dock, navigation bar, features, etc.).
  await cesdk.addPlugin(new PhotoEditorConfig({ onBack: opts.onBack }));

  // Background removal (works on the loaded photo).
  setupBackgroundRemovalPlugin(cesdk);

  // Translate plugin (dock entry + panel + AI gateway credentials).
  const apiKey = import.meta.env.VITE_AI_API_KEY ?? '';
  const gatewayUrl =
    import.meta.env.VITE_AI_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
  setupTranslatePlugin(cesdk, { apiKey, gatewayUrl });

  // Asset source plugins — same set as the photo starter kit, plus the
  // image-upload source the Uploads dock entry points at.
  await cesdk.addPlugin(new BlurAssetSource());
  await cesdk.addPlugin(new ImageColorsAssetSource());
  await cesdk.addPlugin(new ColorPaletteAssetSource());
  await cesdk.addPlugin(new CropPresetsAssetSource());
  await cesdk.addPlugin(new EffectsAssetSource());
  await cesdk.addPlugin(new FiltersAssetSource());
  await cesdk.addPlugin(new PagePresetsAssetSource());
  await cesdk.addPlugin(new StickerAssetSource());
  await cesdk.addPlugin(new TextAssetSource());
  await cesdk.addPlugin(new TextComponentAssetSource());
  await cesdk.addPlugin(new TypefaceAssetSource());
  await cesdk.addPlugin(new VectorShapeAssetSource());
  await cesdk.addPlugin(
    new UploadAssetSources({ include: ['ly.img.image.upload'] })
  );
}
