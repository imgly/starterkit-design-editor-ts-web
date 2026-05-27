/**
 * CE.SDK Design Editor Starterkit - Main Entry Point
 *
 * A complete design editor for creating graphics, templates, and multi-page documents.
 *
 * @see https://img.ly/docs/cesdk/js/getting-started/
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';

import { initDesignEditor } from './imgly';
import {
  getApiKey,
  renderOnboardingScreen,
  setConfiguredApiKey
} from './imgly/plugins/translate';

// ============================================================================
// Configuration
// ============================================================================

const config = {
  userId: 'starterkit-design-editor-user',

  // IMG.LY CDN (for quick testing only, NOT recommended for production)

  // Local assets for development

};

// ============================================================================
// API Key Preflight
//
// Resolve the IMG.LY API key BEFORE mounting CE.SDK. The translate
// feature requires it, and there's no useful demo without it — so when
// it's missing we render the onboarding screen in place of the editor.
//
// The key is read from two sources, in order of precedence:
//   1. `localStorage` (deployed bundles only — written by the onboarding
//      screen's paste-key form).
//   2. `VITE_AI_API_KEY` from `.env`.
//
// `getApiKey()` combines those; setting `setConfiguredApiKey` here is
// just so `getApiKey()` knows about the env source. `initDesignEditor`
// later re-sets it via `installTranslateCredentials` — idempotently.
// ============================================================================

setConfiguredApiKey(import.meta.env.VITE_AI_API_KEY ?? '');

const container = document.querySelector<HTMLDivElement>('#cesdk_container');
if (!container) {
  // eslint-disable-next-line no-console
  console.error('No #cesdk_container element found.');
} else if (!getApiKey()) {
  renderOnboardingScreen(container, { reason: 'missing' });
} else {
  // ==========================================================================
  // Initialize Design Editor
  // ==========================================================================

  CreativeEditorSDK.create(container, config)
    .then(async (cesdk) => {
      // Debug access (remove in production)
      (window as unknown as { cesdk: CreativeEditorSDK }).cesdk = cesdk;

      await initDesignEditor(cesdk);

      // ======================================================================
      // Scene Loading
      // ======================================================================

      await cesdk.loadFromURL(
        'https://cdn.img.ly/packages/imgly/plugin-marketing-asset-source-web/1.0.0/assets/templates/4-5-marketing-ad/scene.scene'
      );
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize CE.SDK:', error);
    });
}
