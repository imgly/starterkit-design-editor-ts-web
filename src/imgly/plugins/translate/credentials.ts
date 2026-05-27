/**
 * IMG.LY AI Gateway credentials (demo / local-dev path).
 *
 * Registers the `ly.img.ai.getToken` action on the CE.SDK instance.
 * Every authenticated gateway call goes through that action — both the
 * official AI plugin's providers and our custom Translate flow.
 *
 * Two key sources are supported, in order of precedence:
 *
 *   1. A user-pasted key in `localStorage` — written by the onboarding
 *      screen when the editor is opened from a deployed bundle
 *      (`import.meta.env.PROD === true`) without a baked-in key.
 *   2. `VITE_AI_API_KEY` — read once at startup and stored in
 *      `envApiKey` via `setConfiguredApiKey`. Used during local dev
 *      after the developer fills in `.env`.
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

// ---------------------------------------------------------------------------
// Env-sourced API key
// ---------------------------------------------------------------------------

let envApiKey = '';

export type AiTokenResult = string | { dangerouslyExposeApiKey: string };

/**
 * Set the env-sourced API key. Called once at startup from the editor
 * wiring. A user-pasted key in `localStorage` takes precedence — see
 * `getApiKey` below.
 */
export function setConfiguredApiKey(key: string): void {
  envApiKey = key;
}

// ---------------------------------------------------------------------------
// User-pasted API key (deployed bundles only — see onboarding screen)
// ---------------------------------------------------------------------------

const USER_API_KEY_STORAGE = 'imgly.translate-demo.apiKey';

/**
 * Read a user-pasted API key from `localStorage`. Only honored when
 * `import.meta.env.PROD === true`; during `vite dev` the `.env` file
 * remains the single source of truth so the dev experience is
 * predictable (no stale browser state lingering between runs).
 */
export function getUserApiKey(): string | undefined {
  if (!import.meta.env.PROD) return undefined;
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = window.localStorage.getItem(USER_API_KEY_STORAGE);
    return stored != null && stored.length > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function setUserApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USER_API_KEY_STORAGE, key);
  } catch {
    // `localStorage` may be disabled (private browsing, quota, etc.).
    // Silently drop — the onboarding screen will re-prompt after reload.
  }
}

export function clearUserApiKey(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(USER_API_KEY_STORAGE);
  } catch {
    // Same reasoning as `setUserApiKey` — nothing to do on failure.
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Effective API key: user-pasted (localStorage, prod only) takes
 * precedence over the env-sourced key.
 */
export function getApiKey(): string {
  const stored = getUserApiKey();
  if (stored != null && stored.length > 0) return stored;
  return envApiKey;
}

/** Resolve a token for `ly.img.ai.getToken` or for the gateway client. */
export async function resolveAiToken(): Promise<AiTokenResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'No AI credentials configured. Set VITE_AI_API_KEY to an API key from ' +
        'https://img.ly/dashboard.'
    );
  }
  return { dangerouslyExposeApiKey: apiKey };
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
