/**
 * Translate plugin — public entry point.
 *
 * Registers the `ly.img.ai.getToken` credential action and wires the
 * custom Translate panel. Dock placement is the host config's
 * responsibility — see `photo-editor/ui/dock.ts`.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { setupTranslatePanel } from './panel';
import { installAiCredentials, setConfiguredApiKey } from './credentials';
import { DEFAULT_GATEWAY_URL } from './providers';
import { configureTranslate } from './translate';

export interface SetupTranslatePluginOpts {
  /** IMG.LY dashboard API key. '' means not configured. */
  apiKey: string;
  /** Gateway URL. Defaults to https://gateway.img.ly. */
  gatewayUrl?: string;
}

export function setupTranslatePlugin(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePluginOpts
): void {
  const gatewayUrl = opts.gatewayUrl ?? DEFAULT_GATEWAY_URL;
  if (!opts.apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      '[translate] No API key configured. Set VITE_AI_API_KEY in .env.'
    );
  }
  setConfiguredApiKey(opts.apiKey);
  installAiCredentials(cesdk);
  configureTranslate({ gatewayUrl });
  setupTranslatePanel(cesdk, { gatewayUrl, apiKey: opts.apiKey });
}

export {
  TRANSLATE_PANEL_ID,
  TRANSLATE_ICON_ID,
  findFirstImageBlockOnFirstPage
} from './panel';
export { TARGET_LANGUAGES, DEFAULT_GATEWAY_URL } from './providers';
export { getApiKey, setConfiguredApiKey } from './credentials';
export {
  renderOnboardingScreen,
  type OnboardingReason,
  type RenderOnboardingScreenOpts
} from './onboarding';
