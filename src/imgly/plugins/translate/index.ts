/**
 * Translate plugin — public entry point (gateway edition).
 *
 * Registers the `ly.img.ai.getToken` credential action and wires the
 * custom Translate panel + dock entry.
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
    console.warn(
      '[translate] No API key configured. Set VITE_AI_API_KEY in .env.'
    );
  }
  setConfiguredApiKey(opts.apiKey);
  installAiCredentials(cesdk);
  configureTranslate({ gatewayUrl });
  setupTranslatePanel(cesdk, { gatewayUrl, apiKey: opts.apiKey });
}

export { TRANSLATE_PANEL_ID, TRANSLATE_ICON_ID } from './panel';
export { TARGET_LANGUAGES, DEFAULT_GATEWAY_URL } from './providers';
export { getApiKey, setConfiguredApiKey } from './credentials';
export {
  renderOnboardingScreen,
  type OnboardingReason,
  type RenderOnboardingScreenOpts
} from './onboarding';

/**
 * Register the `ly.img.ai.getToken` credential action eagerly.
 *
 * Call this BEFORE adding any IMG.LY AI plugin (`ImageGeneration`,
 * `AiApps`, etc.) — those plugins call `fetchSchema` during their own
 * `addPlugin` step, which immediately runs the action. If the action
 * isn't registered yet, you'll see:
 *   "Action 'ly.img.ai.getToken' is not registered".
 *
 * `setupTranslatePlugin` also registers the action (idempotently), so
 * call this only when you need the registration earlier than the
 * Translate panel itself.
 */
export function installTranslateCredentials(
  cesdk: CreativeEditorSDK,
  opts: { apiKey: string }
): void {
  // `setConfiguredApiKey` only sets the env-sourced key. A user-pasted
  // key in `localStorage` (written by the onboarding screen in prod
  // builds) takes precedence and is read dynamically by `resolveAiToken`.
  setConfiguredApiKey(opts.apiKey);
  installAiCredentials(cesdk);
}
