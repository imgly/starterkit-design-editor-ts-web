/**
 * Translate plugin — public entry point.
 *
 * Wires up the custom Translate panel + dock entry. The official
 * `@imgly/plugin-ai-image-generation-web` plugin is added separately in
 * `src/imgly/index.ts` so the editor also gets the regular AI image-edit
 * dock entry "for free", driven by the same provider list.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { setupTranslatePanel } from './panel';
import { configureTranslate } from './translate';

export interface SetupTranslatePluginOpts {
  /**
   * IMG.LY proxy URL. Pass an empty string to indicate "not configured" —
   * the panel will render and surface a clear toast when the user clicks
   * Translate, rather than refusing to register the dock entry.
   */
  proxyUrl: string;
}

export function setupTranslatePlugin(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePluginOpts
): void {
  if (!opts.proxyUrl) {
    // Surfaced visibly when the user clicks Translate; this is just a
    // dev hint at startup.
    console.warn(
      '[translate] No proxy URL configured. ' +
        'Set VITE_IMGLY_AI_PROXY_URL in .env.'
    );
  } else {
    // Configure the fal.ai client singleton ONCE at startup so concurrent
    // translateImage() calls don't race over fal.config(). See translate.ts.
    configureTranslate({ proxyUrl: opts.proxyUrl });
  }
  setupTranslatePanel(cesdk, opts);
}

export { TRANSLATE_PANEL_ID, TRANSLATE_DOCK_ID } from './panel';
export { TRANSLATE_PROVIDERS, TARGET_LANGUAGES } from './providers';
