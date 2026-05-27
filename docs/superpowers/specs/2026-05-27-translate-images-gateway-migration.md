# Translate Images — Gateway Migration Addendum

**Status:** Approved 2026-05-27
**Supersedes implementation choices in:** [2026-05-27-translate-images-design.md](2026-05-27-translate-images-design.md). Goals, non-goals, page-creation contract, and panel UX are unchanged. Only the **provider/auth/HTTP layer** changes.

## Why

The original design wired the feature through the `@imgly/plugin-ai-image-generation-web` **self-hosted-proxy** API:

- `FalAiImage.NanoBananaEdit({ proxyUrl })` provider construction.
- `@fal-ai/client` for our custom HTTP path.
- `VITE_IMGLY_AI_PROXY_URL` pointing at a server the developer runs.

That is the wrong target for IMG.LY's customers: the recommended path is the **managed AI Gateway** at `https://gateway.img.ly`. The same npm package exposes a second, gateway-aware API:

- `ImageGatewayProvider(modelId, { gatewayUrl })` provider construction.
- `createGatewayClient(gatewayUrl, getToken, headers?)` for direct HTTP.
- `VITE_AI_API_KEY` + optional `VITE_AI_GATEWAY_URL` (matches the [starterkit-ai-editor-react-web](https://github.com/imgly/starterkit-ai-editor-react-web/tree/v1.75.1)).

Switching aligns this starter with the official AI starter and removes the need to deploy or operate a proxy server.

## Goal

Replace the self-hosted-proxy wiring with the managed Gateway wiring, with **no change to the user-visible feature**. After the migration:

- User still selects an image, clicks Translate, picks a model, checks languages, gets one new page per language.
- The model dropdown lists **every image-edit model the gateway exposes** (dynamic catalog), instead of a hard-coded list of 7.
- `.env` needs only one credential (the IMG.LY API key) instead of a proxy URL pointing at a server you've stood up.

## Goals (concrete)

1. Provider construction uses `ImageGatewayProvider` from `@imgly/plugin-ai-image-generation-web/gateway`.
2. Authentication centralised on the registered CE.SDK action `ly.img.ai.getToken`, returning `{ dangerouslyExposeApiKey: VITE_AI_API_KEY }` (demo/dev-only path, with a clearly written production caveat in the README).
3. Translation HTTP path uses `createGatewayClient` (from `@imgly/plugin-ai-generation-web/gateway`) — `client.upload` + `client.generate` — instead of `@fal-ai/client` + a custom OpenAI adapter.
4. Model catalog is fetched live from `GET ${gatewayUrl}/v1/models?groupBy=capability`, filtered to the `image2image` capability, and rendered into the model dropdown. Loading and error states are visible to the user.
5. `@fal-ai/client` dependency is removed.
6. `.env.example` declares `VITE_AI_API_KEY` and optional `VITE_AI_GATEWAY_URL`; `VITE_IMGLY_AI_PROXY_URL` is removed.

## Non-Goals

- Production JWT-minting flow. We use the `{ dangerouslyExposeApiKey }` dev path with a clear README warning, matching the official AI starter kit.
- A separate React onboarding screen when the key is missing. The existing missing-config toast in our panel is sufficient for a starter.
- Caching the catalog across page reloads. One fetch per panel open is fine.
- Quick-action wiring (`ly.img.editImage` etc.) on the AI plugin. The Translate feature has its own panel; the AI plugin's regular image-edit dock entry will still work as long as providers are registered.

## Module changes

The file layout stays the same. Changes within each module:

### `src/imgly/plugins/translate/providers.ts`

- Drop the `TranslateProviderKind` ('fal' | 'openai') discriminator — the gateway abstracts the underlying provider.
- Drop `TRANSLATE_PROVIDERS` as a hard-coded list.
- Drop `toAiPluginProvider`.
- Drop `DEFAULT_PROXY_URL`.
- Drop the fal/openai imports.
- New exports:

```ts
import { GatewayProvider as ImageGatewayProvider } from '@imgly/plugin-ai-image-generation-web/gateway';

export const DEFAULT_GATEWAY_URL = 'https://gateway.img.ly';

export interface TranslateModel {
  /** Gateway model id, e.g. 'bfl/flux-2-edit'. */
  id: string;
  /** Optional display name override; otherwise we use `id`. */
  label?: string;
}

// TARGET_LANGUAGES stays as-is.
export interface TargetLanguage { /* unchanged */ }
export const TARGET_LANGUAGES: TargetLanguage[] = [/* unchanged */];

/** Convenience: factory that returns one AI-plugin provider per model id. */
export function instantiateGatewayProviders(
  modelIds: string[],
  gatewayUrl: string
) {
  return modelIds.map((id) => ImageGatewayProvider(id, { gatewayUrl }));
}
```

### `src/imgly/plugins/translate/credentials.ts` (NEW)

Registers `ly.img.ai.getToken`. Surface mirrors the official starter's `ai-credentials.ts`, trimmed:

```ts
export function installAiCredentials(
  cesdk: CreativeEditorSDK,
  opts: { apiKey: string }
): void;

export function getCachedApiKey(): string;
```

The action returns `{ dangerouslyExposeApiKey: opts.apiKey }`. A module-level variable stores the key so `translate.ts`'s gateway client can call back into the same value via a `getToken` callback.

### `src/imgly/plugins/translate/catalog.ts` (NEW)

```ts
export interface TranslateCatalogEntry {
  id: string;
  label: string;
}

export async function fetchImageEditCatalog(
  gatewayUrl: string,
  getToken: () => Promise<string>,
  signal?: AbortSignal
): Promise<TranslateCatalogEntry[]>;
```

Hits `GET ${gatewayUrl}/v1/models?groupBy=capability` with bearer auth, picks the `image2image` bucket, returns `{ id, label }[]`. Errors propagate to the caller (panel handles UI).

### `src/imgly/plugins/translate/translate.ts`

Drop fal/openai branches. Single path:

```ts
import { createGatewayClient } from '@imgly/plugin-ai-generation-web/gateway';

export function configureTranslate(opts: {
  gatewayUrl: string;
  getToken: () => Promise<string>;
}): void;

export async function translateImage(args: {
  image: Blob;
  targetLanguagePromptName: string;
  modelId: string;
  signal?: AbortSignal;
}): Promise<Blob>;
```

`configureTranslate` builds a `GatewayClient` once. `translateImage`:

1. `await client.upload(image, 'image/png')` → `{ asset_url, ... }`.
2. `await client.generate(modelId, { prompt, image_url: asset_url }, { abortSignal })` → output URL.
3. `await fetch(outputUrl, { signal })` → Blob.

The prompt template is unchanged.

### `src/imgly/plugins/translate/panel.ts`

- Add local panel state `catalog: { status: 'idle' | 'loading' | 'ready' | 'error'; entries: TranslateCatalogEntry[]; error?: string }`.
- On panel open (or whenever `catalog.status === 'idle'`), call `fetchImageEditCatalog` and update state.
- Model dropdown reads from `catalog.entries`. While loading, the dropdown is disabled with a "Loading models…" hint. On error, the dropdown is disabled with a clear error message and a Retry button.
- Translate button stays disabled while `catalog.status !== 'ready'`.
- Remove `findProvider` usage; the provider id is just a string passed through.

### `src/imgly/plugins/translate/index.ts`

```ts
export interface SetupTranslatePluginOpts {
  apiKey: string;      // '' = not configured (panel will show clear toast)
  gatewayUrl?: string; // default DEFAULT_GATEWAY_URL
}
```

`setupTranslatePlugin`:

1. If `apiKey === ''`, console.warn (visible toast comes from the panel).
2. `installAiCredentials(cesdk, { apiKey })`.
3. `configureTranslate({ gatewayUrl, getToken: resolveAiToken })`.
4. `setupTranslatePanel(cesdk, { gatewayUrl })`.

### `src/imgly/index.ts`

- Read `VITE_AI_API_KEY` and `VITE_AI_GATEWAY_URL` (with default `https://gateway.img.ly`).
- Register the AI plugin with `image2image: instantiateGatewayProviders(curatedIds, gatewayUrl)` where `curatedIds` is a short hard-coded fallback list (so the bonus dock entry has *something* even before catalog fetch). Curated list is small: `['bfl/flux-2-edit']` plus 1–2 others.
- Call `setupTranslatePlugin(cesdk, { apiKey, gatewayUrl })`.

### `src/vite-env.d.ts`

Replace `VITE_IMGLY_AI_PROXY_URL` with `VITE_AI_API_KEY` and `VITE_AI_GATEWAY_URL`.

### `.env.example`

Replace the proxy section with the gateway section, matching the official starter's wording.

### `README.md`

Update the "Configuration" subsection to point at `VITE_AI_API_KEY` and link to `https://img.ly/dashboard` for key creation. Update step 6 of the smoke checklist (was "unset proxy URL"; now "unset API key"). Add a one-line production caveat about `dangerouslyExposeApiKey`.

### `package.json`

- Add `@imgly/plugin-ai-generation-web` (peer of the gateway client; was a transitive dep, now a direct one).
- Remove `@fal-ai/client`.

## Data Flow (after migration)

On panel open:

1. Read selection (unchanged).
2. If catalog not yet loaded, `fetchImageEditCatalog(...)` — UI shows "Loading models…".
3. Populate dropdown; default to first entry.

On Translate click:

1. Capture source block + page (unchanged).
2. `engine.block.export(fill, { mimeType: 'image/png' })` (unchanged).
3. `Promise.allSettled(targetLanguages.map(lang => translateImage({ image, modelId, ... })))`.
4. Inside `translateImage`: gateway client uploads → generates → downloads. One auth token, one request shape, one error envelope.
5. Sequential commit via `appendTranslatedPage` (unchanged).
6. Single undo step + combined toast (unchanged).

## Error Handling Changes

| Condition | Behaviour |
| --- | --- |
| Catalog fetch returns 401/403 | Panel shows "API key invalid. Check `VITE_AI_API_KEY`." Retry button visible. |
| Catalog fetch network error | Panel shows "Cannot reach the IMG.LY gateway." Retry button visible. |
| Per-language `client.generate` failure | Same as before — `Promise.allSettled` collects it, combined toast at end. |
| Missing API key | Translate button disabled with inline hint, identical to the existing "no proxy URL" path but with the new env var name in the message. |

## Verification

Same six-step manual smoke checklist in the README, with step 6 updated to test missing API key (and step 1 prerequisite updated to set `VITE_AI_API_KEY` instead of the proxy URL).

## Open Implementation Questions

- Curated fallback model ID list for the AI plugin registration — pick from `CURATED_MODELS.image2image` in the official starter (`['bfl/flux-2-edit']` is the current choice; we'll match).
- Whether `client.generate`'s SSE-based progress (`generation.delta`) is worth surfacing as per-language progress in the panel; resolved: no for v1, the existing block-state spinner is enough.
