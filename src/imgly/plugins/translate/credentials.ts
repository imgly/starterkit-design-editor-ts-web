/**
 * IMG.LY AI Gateway credentials (demo / local-dev path).
 *
 * Registers the `ly.img.ai.getToken` action on the CE.SDK instance.
 * Every authenticated gateway call goes through that action — both the
 * official AI plugin's providers and our custom Translate flow.
 *
 * ⚠️ PRODUCTION WARNING
 *
 * `resolveAiToken` returns the raw API key via `{ dangerouslyExposeApiKey }`.
 * This is intentional for a starter kit's local-dev experience but is
 * NOT appropriate for production. In production:
 *
 *   1. Keep the API key on a backend you control.
 *   2. Mint a short-lived JWT bound to the current user/session.
 *   3. Replace `resolveAiToken` to return that JWT string directly
 *      (no `dangerouslyExposeApiKey`).
 *
 * Full recipe:
 *   https://img.ly/docs/cesdk/js/user-interface/ai-integration/gateway-provider-06df22/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

let configuredApiKey = '';

export type AiTokenResult = string | { dangerouslyExposeApiKey: string };

/**
 * Set the API key the token action will return. Called once from
 * `setupTranslatePlugin` at startup. Returning the dev path
 * (`dangerouslyExposeApiKey`) is intentional — see file header.
 */
export function setConfiguredApiKey(key: string): void {
  configuredApiKey = key;
}

/** Read the configured key (used by the gateway client's getToken callback). */
export function getConfiguredApiKey(): string {
  return configuredApiKey;
}

/** Resolve a token for `ly.img.ai.getToken` or for the gateway client. */
export async function resolveAiToken(): Promise<AiTokenResult> {
  if (!configuredApiKey) {
    throw new Error(
      'No AI credentials configured. Set VITE_AI_API_KEY to an API key from ' +
        'https://img.ly/dashboard.'
    );
  }
  return { dangerouslyExposeApiKey: configuredApiKey };
}

/** Collapse `AiTokenResult` to the raw bearer string. */
export function bearerFromTokenResult(token: AiTokenResult): string {
  return typeof token === 'string' ? token : token.dangerouslyExposeApiKey;
}

let credentialsInstalled = false;

/**
 * Register `ly.img.ai.getToken` on the cesdk instance.
 *
 * Idempotent: safe to call multiple times. Necessary because the AI
 * plugins fetch their model schemas during `addPlugin`, which means the
 * action must already be registered before any plugin that uses it runs.
 * Callers commonly invoke this once explicitly in editor wiring AND once
 * from `setupTranslatePlugin`; the guard makes both paths safe.
 */
export function installAiCredentials(cesdk: CreativeEditorSDK): void {
  if (credentialsInstalled) return;
  credentialsInstalled = true;
  cesdk.actions.register('ly.img.ai.getToken', resolveAiToken);
}
