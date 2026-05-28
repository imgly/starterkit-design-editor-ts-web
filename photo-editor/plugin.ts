/**
 * Photo Editor Plugin - Complete Photo Editing Configuration for CE.SDK
 *
 * This plugin provides a production-ready photo editor configuration optimized
 * for single-image editing with crop, adjustments, filters, and effects.
 *
 * @example Basic usage
 * ```typescript
 * import CreativeEditorSDK from '@cesdk/cesdk-js';
 * import { PhotoEditorConfig } from './plugin';
 *
 * const cesdk = await CreativeEditorSDK.create('#editor', config);
 * await cesdk.addPlugin(new PhotoEditorConfig({ onBack: () => {} }));
 * ```
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/disable-or-enable-f058e2/
 * @see https://img.ly/docs/cesdk/js/configuration-2c1c3d/
 */

import type { EditorPlugin, EditorPluginContext } from '@cesdk/cesdk-js';
import CreativeEditorSDK from '@cesdk/cesdk-js';

import { setupActions } from './actions';
import { setupFeatures } from './features';
import { setupTranslations } from './i18n';
import { setupSettings } from './settings';
import { setupUI } from './ui';

export interface PhotoEditorConfigOpts {
  /** Handler for the navigation-bar Back button. */
  onBack: () => void;
}

/**
 * Photo Editor configuration plugin.
 *
 * @public
 */
export class PhotoEditorConfig implements EditorPlugin {
  name = 'cesdk-photo-editor';
  version = CreativeEditorSDK.version;

  private opts: PhotoEditorConfigOpts;

  constructor(opts: PhotoEditorConfigOpts) {
    this.opts = opts;
  }

  async initialize(ctx: EditorPluginContext) {
    const subscriptions: (() => void)[] = [];
    const { cesdk, engine } = ctx;
    if (cesdk) {
      cesdk.resetEditor();
      setupFeatures(cesdk);
      setupUI(cesdk, this.opts);
      setupActions(cesdk);
      setupTranslations(cesdk);
      setupOnReset(cesdk, subscriptions);
      setupSettings(engine);
      // eslint-disable-next-line -- Intentional backward-compat shim.
      cesdk.reapplyLegacyUserConfiguration();
    }
  }
}

function setupOnReset(
  cesdk: CreativeEditorSDK,
  subscriptions: (() => void)[]
): void {
  cesdk.onReset(() => {
    subscriptions.forEach((unsubscribe) => unsubscribe());
    subscriptions.length = 0;
  });
}
