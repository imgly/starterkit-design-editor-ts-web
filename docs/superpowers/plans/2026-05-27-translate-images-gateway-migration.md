# Translate Images — Gateway Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Migrate the Translate feature from the self-hosted-proxy API to the managed IMG.LY AI Gateway. User-visible behavior is unchanged; only the provider/auth/HTTP layer is reworked.

**Architecture:** Replace `FalAiImage` / `OpenAiImage` providers with `ImageGatewayProvider`, replace `@fal-ai/client` with `createGatewayClient` from `@imgly/plugin-ai-generation-web/gateway`, centralize auth on the `ly.img.ai.getToken` CE.SDK action, switch env vars to `VITE_AI_API_KEY` + `VITE_AI_GATEWAY_URL`, and fetch the image-edit model catalog dynamically from `GET /v1/models?groupBy=capability`.

**Tech Stack:** TypeScript, Vite, CE.SDK 1.75.x, `@imgly/plugin-ai-image-generation-web/gateway`, `@imgly/plugin-ai-generation-web/gateway`.

**Spec:** [2026-05-27-translate-images-gateway-migration.md](../specs/2026-05-27-translate-images-gateway-migration.md). Original spec [2026-05-27-translate-images-design.md](../specs/2026-05-27-translate-images-design.md) still governs goals, UX, page-creation contract, and error handling philosophy.

**Branch context:** Eight commits already on `add-translate-feature` implement the (wrong-target) self-hosted-proxy version. These migration commits land on top, by user request — clear audit trail of what changed and why.

---

## Conventions

- Manual smoke testing only (per spec); no unit tests.
- Commit after each migration task; one task = one commit.
- After every code-producing task, run `npm run check:syntax` and verify clean output before committing.

---

## Task M1: Switch providers + credentials wiring

**Files:**
- Replace: `src/imgly/plugins/translate/providers.ts`
- Create: `src/imgly/plugins/translate/credentials.ts`
- Modify: `package.json` (add `@imgly/plugin-ai-generation-web`, remove `@fal-ai/client`)

- [ ] **Step 1: Install / remove deps**

```bash
npm uninstall @fal-ai/client
npm install @imgly/plugin-ai-generation-web@^1.75.1
```

- [ ] **Step 2: Replace `providers.ts` with the gateway version**

Overwrite `src/imgly/plugins/translate/providers.ts` with:

```ts
/**
 * Translate feature — provider + language constants.
 *
 * After the gateway migration this module no longer hard-codes a list of
 * provider/model pairs: the dropdown is populated dynamically from the
 * gateway catalog (see `catalog.ts`). What stays here is the gateway URL
 * default, the target-language list, and a small helper for instantiating
 * `ImageGatewayProvider` instances from a list of model ids.
 */

import { GatewayProvider as ImageGatewayProvider } from '@imgly/plugin-ai-image-generation-web/gateway';

export const DEFAULT_GATEWAY_URL = 'https://gateway.img.ly';

/** Target languages the Translate panel offers. */
export interface TargetLanguage {
  /** Stable id (also the locale tag we hand to the LLM). */
  id: string;
  /** Label shown in the checkbox + the new page's name. */
  label: string;
  /** English name of the language used inside the prompt. */
  promptName: string;
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { id: 'de', label: 'German', promptName: 'German' },
  { id: 'en', label: 'English', promptName: 'English' },
  { id: 'es', label: 'Spanish', promptName: 'Spanish' },
  { id: 'ru', label: 'Russian', promptName: 'Russian' },
  { id: 'zh', label: 'Chinese (Simplified)', promptName: 'Simplified Chinese' }
];

/**
 * Curated fallback model ids for the official AI plugin's image-edit dock
 * entry. The Translate panel itself uses the live gateway catalog instead
 * — this list is only what the AI plugin registers at startup so its
 * dropdown is non-empty before any UI is opened.
 *
 * Pick a small, stable set that you know lives in the gateway catalog.
 */
export const CURATED_IMAGE_EDIT_MODEL_IDS = ['bfl/flux-2-edit'];

/**
 * Build one `ImageGatewayProvider` per model id. Used in
 * `src/imgly/index.ts` to register the AI plugin's `image2image`
 * providers (the bonus regular image-edit dock entry).
 */
export function instantiateGatewayProviders(
  modelIds: string[],
  gatewayUrl: string
) {
  return modelIds.map((id) => ImageGatewayProvider(id, { gatewayUrl }));
}
```

- [ ] **Step 3: Create `credentials.ts`**

Create `src/imgly/plugins/translate/credentials.ts`:

```ts
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

/** Register `ly.img.ai.getToken` on the cesdk instance. */
export function installAiCredentials(cesdk: CreativeEditorSDK): void {
  cesdk.actions.register('ly.img.ai.getToken', resolveAiToken);
}
```

- [ ] **Step 4: Verify compile**

Run: `npm run check:syntax`.

The file `translate.ts` still imports `findProvider` and `TranslateProvider` from `./providers` — those exports no longer exist, so the file will fail to compile until Task M2 rewrites it. That is expected and acceptable mid-task — verify with `tsc --noEmit` after Task M2 lands, not after M1 alone. To unblock M1's commit step, **comment out the body of `translate.ts` temporarily** by wrapping the file contents in `/* */` and adding `export {};` at the end, so the package keeps compiling:

```ts
// src/imgly/plugins/translate/translate.ts
// TEMPORARILY DISABLED — rewritten by Task M2 of the gateway migration.
export {};
/*
... entire former file body ...
*/
```

This is a deliberate 1-task scaffold. M2 replaces it with the real gateway implementation.

After commenting out, run `npm run check:syntax` again — it should be clean.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json \
  src/imgly/plugins/translate/providers.ts \
  src/imgly/plugins/translate/credentials.ts \
  src/imgly/plugins/translate/translate.ts
git commit -m "Migrate Translate to AI Gateway: providers + credentials (M1)

translate.ts temporarily stubbed; rewritten in M2."
```

---

## Task M2: Rewrite `translate.ts` to use the gateway client

**Files:**
- Replace: `src/imgly/plugins/translate/translate.ts`

- [ ] **Step 1: Write the new `translate.ts`**

```ts
/**
 * Image translation via the IMG.LY AI Gateway.
 *
 * Pure adapter: takes a source image Blob + target language + model id,
 * returns the translated image Blob. Knows nothing about CE.SDK.
 */

import {
  createGatewayClient,
  type GatewayClient
} from '@imgly/plugin-ai-generation-web/gateway';

import { bearerFromTokenResult, resolveAiToken } from './credentials';

export class TranslateError extends Error {
  constructor(
    message: string,
    public readonly language: string,
    public readonly modelId: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TranslateError';
  }
}

const PROMPT_TEMPLATE =
  'Translate every piece of visible text in this image to {language}. ' +
  'Preserve the original layout, typography, colors, and visual composition ' +
  'exactly — only replace the text content. Do not add, remove, or restyle ' +
  'anything else.';

function buildPrompt(languagePromptName: string): string {
  return PROMPT_TEMPLATE.replace('{language}', languagePromptName);
}

let client: GatewayClient | null = null;
let configuredGatewayUrl: string | null = null;

/**
 * Build the gateway client once. Re-builds if the gateway URL changes
 * (it shouldn't during a session, but we don't pin).
 */
export function configureTranslate(opts: { gatewayUrl: string }): void {
  if (configuredGatewayUrl === opts.gatewayUrl && client != null) return;
  configuredGatewayUrl = opts.gatewayUrl;
  client = createGatewayClient(opts.gatewayUrl, async () => {
    const token = await resolveAiToken();
    return bearerFromTokenResult(token);
  });
}

export interface TranslateImageArgs {
  image: Blob;
  targetLanguageId: string;
  targetLanguagePromptName: string;
  modelId: string;
  signal?: AbortSignal;
}

export async function translateImage(args: TranslateImageArgs): Promise<Blob> {
  if (!client) {
    throw new TranslateError(
      'Translate is not configured. configureTranslate() must be called first.',
      args.targetLanguageId,
      args.modelId
    );
  }

  const prompt = buildPrompt(args.targetLanguagePromptName);

  try {
    // 1. Upload the source image to gateway storage; gateway returns a
    //    short-lived asset URL the model can read.
    const upload = await client.upload(
      args.image,
      args.image.type || 'image/png'
    );

    // 2. Kick off generation. The client subscribes to the SSE stream and
    //    resolves with the output URL when `generation.completed` fires.
    const outputUrl = await client.generate(
      args.modelId,
      {
        prompt,
        image_url: upload.asset_url
      },
      { abortSignal: args.signal }
    );

    // 3. Download the generated image into a Blob the scene can embed.
    const resp = await fetch(outputUrl, { signal: args.signal });
    if (!resp.ok) {
      throw new TranslateError(
        `Failed to download translated image: ${resp.status}`,
        args.targetLanguageId,
        args.modelId
      );
    }
    return await resp.blob();
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    throw new TranslateError(
      err instanceof Error ? err.message : 'Translation failed',
      args.targetLanguageId,
      args.modelId,
      err
    );
  }
}
```

- [ ] **Step 2: Verify compile**

Run: `npm run check:syntax`.

`panel.ts` still references the old `findProvider` / `TranslateProvider` / `providerId` field on `TranslateImageArgs`. Expect compile errors there. Don't fix `panel.ts` yet — Task M3 handles it. To make this M2 commit standalone-compileable, **comment out `panel.ts`'s body** the same way M1 did `translate.ts`:

```ts
// src/imgly/plugins/translate/panel.ts
// TEMPORARILY DISABLED — rewritten by Task M3 of the gateway migration.
export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
export const TRANSLATE_DOCK_ID = 'ly.img.translate.dock';
export interface SetupTranslatePanelOpts { gatewayUrl: string }
export function setupTranslatePanel(_cesdk: unknown, _opts: SetupTranslatePanelOpts): void { /* stubbed */ }
```

Also update `src/imgly/plugins/translate/index.ts`'s import of `setupTranslatePanel` if the import shape no longer matches (it should still be the same name; only the body changes).

Run `npm run check:syntax` again — should be clean.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/translate.ts src/imgly/plugins/translate/panel.ts
git commit -m "Migrate Translate to AI Gateway: HTTP path (M2)

translate.ts now uses createGatewayClient (upload + generate).
panel.ts temporarily stubbed; rewritten in M3."
```

---

## Task M3: Dynamic model catalog + rebuilt panel

**Files:**
- Create: `src/imgly/plugins/translate/catalog.ts`
- Replace: `src/imgly/plugins/translate/panel.ts`

- [ ] **Step 1: Create `catalog.ts`**

```ts
/**
 * Fetches the gateway's model catalog and filters to image-edit models.
 *
 * Hits `GET ${gatewayUrl}/v1/models?groupBy=capability`. The response is
 * a JSON object whose `image2image` key (if present) is an array of
 * `{ id, name? }` entries.
 */

import {
  bearerFromTokenResult,
  resolveAiToken
} from './credentials';

export interface TranslateCatalogEntry {
  /** Gateway model id (passed to `client.generate`). */
  id: string;
  /** Display label. Falls back to `id` if the gateway has no name. */
  label: string;
}

interface RawModelEntry {
  id?: string;
  name?: string;
}

export async function fetchImageEditCatalog(
  gatewayUrl: string,
  signal?: AbortSignal
): Promise<TranslateCatalogEntry[]> {
  const token = await resolveAiToken();
  const bearer = bearerFromTokenResult(token);

  const url = `${gatewayUrl.replace(/\/$/, '')}/v1/models?groupBy=capability`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal
  });
  if (!res.ok) {
    throw new Error(
      `Gateway returned ${res.status} ${res.statusText} for /v1/models.`
    );
  }
  const json = (await res.json()) as Record<string, RawModelEntry[]>;
  const raw = json['image2image'] ?? [];
  return raw
    .filter((m): m is RawModelEntry & { id: string } => typeof m.id === 'string')
    .map((m) => ({ id: m.id, label: m.name ?? m.id }));
}
```

- [ ] **Step 2: Replace `panel.ts`**

```ts
/**
 * Custom Translate panel + dock entry (gateway edition).
 *
 * The model dropdown is populated from a live fetch against the gateway's
 * /v1/models endpoint, filtered to image2image-capable models.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { TARGET_LANGUAGES } from './providers';
import { translateImage, TranslateError } from './translate';
import { appendTranslatedPage } from './pages';
import {
  fetchImageEditCatalog,
  type TranslateCatalogEntry
} from './catalog';

export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
export const TRANSLATE_DOCK_ID = 'ly.img.translate.dock';

export interface SetupTranslatePanelOpts {
  gatewayUrl: string;
  /** Empty string means "not configured" — panel surfaces a clear toast. */
  apiKey: string;
}

// Module-level cancel handle (see prior review — one panel instance).
let currentController: AbortController | null = null;

// Module-level catalog cache so we don't refetch on every panel re-render.
type CatalogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; entries: TranslateCatalogEntry[] }
  | { status: 'error'; message: string };

let catalog: CatalogState = { status: 'idle' };
const catalogSubscribers = new Set<() => void>();

function setCatalog(next: CatalogState): void {
  catalog = next;
  for (const fn of catalogSubscribers) fn();
}

async function loadCatalog(gatewayUrl: string): Promise<void> {
  if (catalog.status === 'loading') return;
  setCatalog({ status: 'loading' });
  try {
    const entries = await fetchImageEditCatalog(gatewayUrl);
    setCatalog({ status: 'ready', entries });
  } catch (err) {
    setCatalog({
      status: 'error',
      message: err instanceof Error ? err.message : 'Catalog fetch failed.'
    });
  }
}

export function setupTranslatePanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  registerTranslations(cesdk);
  registerPanel(cesdk, opts);
  registerDockEntry(cesdk);
}

function registerTranslations(cesdk: CreativeEditorSDK): void {
  cesdk.i18n.setTranslations({
    en: {
      'panel.translate.title': 'Translate Image',
      'panel.translate.model': 'Model',
      'panel.translate.translate': 'Translate',
      'panel.translate.cancel': 'Cancel',
      'panel.translate.retry': 'Retry',
      'panel.translate.hint.noSelection':
        'Select an image block to translate.',
      'panel.translate.hint.noLanguages':
        'Choose at least one target language.',
      'panel.translate.hint.noApiKey':
        'AI API key not configured. Set VITE_AI_API_KEY in .env.',
      'panel.translate.catalog.loading': 'Loading available models…',
      'panel.translate.catalog.error': 'Could not load models from the gateway.',
      'libraries.ly.img.translate.label': 'Translate'
    }
  });
}

function registerPanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  cesdk.ui.registerPanel(TRANSLATE_PANEL_ID, ({ builder, engine, state }) => {
    const apiKeyConfigured = opts.apiKey.length > 0;

    // Kick off the catalog fetch lazily on first render. Idempotent.
    if (apiKeyConfigured && catalog.status === 'idle') {
      void loadCatalog(opts.gatewayUrl);
    }

    // Force-rerender hook: subscribe a no-op reactive state to a
    // `catalogVersion` counter we bump when catalog changes.
    const version = state('translate.catalogVersion', 0);
    catalogSubscribers.add(() => version.setValue(version.value + 1));

    // Reactive panel state.
    const modelId = state<string>('translate.modelId', '');
    const checked = state<Record<string, boolean>>(
      'translate.languages',
      {}
    );
    const isRunning = state('translate.isRunning', false);

    const selection = engine.block.findAllSelected();
    const selectedImageBlock = pickImageFillBlock(engine, selection);
    const selectedLanguages = TARGET_LANGUAGES.filter(
      (lang) => checked.value[lang.id]
    );

    // Resolve the effective model id: user choice if set + still valid,
    // else first entry in the catalog.
    let effectiveModelId = modelId.value;
    if (catalog.status === 'ready') {
      const inCatalog = catalog.entries.some((e) => e.id === effectiveModelId);
      if (!inCatalog) effectiveModelId = catalog.entries[0]?.id ?? '';
    } else {
      effectiveModelId = '';
    }

    const catalogReady = catalog.status === 'ready';

    const disabledReason = !apiKeyConfigured
      ? 'panel.translate.hint.noApiKey'
      : !catalogReady
      ? null // disabled, but no hint — catalog status text shows instead
      : selectedImageBlock == null
      ? 'panel.translate.hint.noSelection'
      : selectedLanguages.length === 0
      ? 'panel.translate.hint.noLanguages'
      : null;

    builder.Section('translate.section', {
      title: 'panel.translate.title',
      children: () => {
        // Catalog status row.
        if (apiKeyConfigured && catalog.status === 'loading') {
          builder.Text('translate.catalog.status', {
            content: cesdk.i18n.translate('panel.translate.catalog.loading')
          });
        }
        if (catalog.status === 'error') {
          builder.Text('translate.catalog.status', {
            content: `${cesdk.i18n.translate(
              'panel.translate.catalog.error'
            )} ${catalog.message}`
          });
          builder.Button('translate.catalog.retry', {
            label: 'panel.translate.retry',
            onClick: () => {
              void loadCatalog(opts.gatewayUrl);
            }
          });
        }

        // Model dropdown — populated from catalog.entries.
        const dropdownEntries =
          catalog.status === 'ready' ? catalog.entries : [];
        const selectValues = dropdownEntries.map((e) => ({
          id: e.id,
          label: e.label
        }));
        const selectValue =
          dropdownEntries.find((e) => e.id === effectiveModelId) ??
          dropdownEntries[0] ??
          null;

        if (selectValue) {
          builder.Select('translate.model', {
            inputLabel: 'panel.translate.model',
            values: selectValues,
            value: selectValue,
            setValue: (v: { id: string; label: string }) =>
              modelId.setValue(v.id)
          });
        }

        for (const lang of TARGET_LANGUAGES) {
          builder.Checkbox(`translate.lang.${lang.id}`, {
            inputLabel: lang.label,
            value: !!checked.value[lang.id],
            setValue: (v: boolean) =>
              checked.setValue({ ...checked.value, [lang.id]: v })
          });
        }

        if (disabledReason !== null) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate(disabledReason)
          });
        }

        if (isRunning.value) {
          builder.Button('translate.cancel', {
            label: 'panel.translate.cancel',
            color: 'danger',
            onClick: () => {
              currentController?.abort();
            }
          });
        } else {
          builder.Button('translate.go', {
            label: 'panel.translate.translate',
            color: 'accent',
            isDisabled:
              disabledReason != null ||
              !catalogReady ||
              effectiveModelId === '',
            onClick: () => {
              const block = selectedImageBlock;
              if (!block) return;
              const controller = new AbortController();
              currentController = controller;
              isRunning.setValue(true);
              void runTranslation({
                cesdk,
                modelId: effectiveModelId,
                block,
                languages: selectedLanguages,
                signal: controller.signal
              }).finally(() => {
                isRunning.setValue(false);
                currentController = null;
              });
            }
          });
        }
      }
    });
  });
}

function registerDockEntry(cesdk: CreativeEditorSDK): void {
  cesdk.ui.registerComponent(TRANSLATE_DOCK_ID, ({ builder }) => {
    builder.Button(`${TRANSLATE_DOCK_ID}.button`, {
      label: 'libraries.ly.img.translate.label',
      icon: '@imgly/Language',
      isActive: cesdk.ui.isPanelOpen(TRANSLATE_PANEL_ID),
      onClick: () => {
        if (cesdk.ui.isPanelOpen(TRANSLATE_PANEL_ID)) {
          cesdk.ui.closePanel(TRANSLATE_PANEL_ID);
        } else {
          cesdk.ui.openPanel(TRANSLATE_PANEL_ID);
        }
      }
    });
  });

  cesdk.ui.insertOrderComponent(
    { in: 'ly.img.dock', position: 'end' },
    TRANSLATE_DOCK_ID
  );
}

function pickImageFillBlock(
  engine: CreativeEditorSDK['engine'],
  selection: number[]
): number | null {
  if (selection.length !== 1) return null;
  const block = selection[0];
  if (!engine.block.supportsFill(block)) return null;
  const fill = engine.block.getFill(block);
  if (engine.block.getType(fill) !== '//ly.img.ubq/fill/image') return null;
  return block;
}

interface RunArgs {
  cesdk: CreativeEditorSDK;
  modelId: string;
  block: number;
  languages: typeof TARGET_LANGUAGES;
  signal: AbortSignal;
}

async function runTranslation(args: RunArgs): Promise<void> {
  const { cesdk, modelId, block, languages, signal } = args;
  const engine = cesdk.engine;

  const fill = engine.block.getFill(block);
  const sourcePageId = findParentPage(engine, block);
  if (sourcePageId == null) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not find the source page.',
      duration: 'medium'
    });
    return;
  }

  let sourceBlob: Blob;
  try {
    sourceBlob = await engine.block.export(fill, { mimeType: 'image/png' });
  } catch (err) {
    console.error('Failed to export source image:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Failed to read the source image.',
      duration: 'medium'
    });
    return;
  }

  engine.block.setState(block, { type: 'Pending', progress: 0 });

  try {
    const results = await Promise.allSettled(
      languages.map((lang) =>
        translateImage({
          image: sourceBlob,
          targetLanguageId: lang.id,
          targetLanguagePromptName: lang.promptName,
          modelId,
          signal
        }).then((blob) => ({ lang, blob }))
      )
    );

    if (signal.aborted) {
      cesdk.ui.showNotification({
        type: 'info',
        message: 'Translation cancelled.',
        duration: 'short'
      });
      return;
    }

    const failures: { lang: string; error: unknown }[] = [];
    let added = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const lang = languages[i];
      if (r.status === 'fulfilled') {
        try {
          await appendTranslatedPage({
            cesdk,
            sourcePageId,
            translated: r.value.blob,
            label: lang.label
          });
          added++;
        } catch (err) {
          console.error(`Failed to append page for ${lang.label}:`, err);
          failures.push({ lang: lang.label, error: err });
        }
      } else {
        const err = r.reason;
        console.error(
          `Translation failed for ${lang.label}:`,
          err instanceof TranslateError ? err.cause ?? err : err
        );
        failures.push({ lang: lang.label, error: err });
      }
    }

    if (added > 0) {
      engine.editor.addUndoStep();
    }

    if (failures.length === 0) {
      cesdk.ui.showNotification({
        type: 'success',
        message: `${added} translated page${added === 1 ? '' : 's'} added.`,
        duration: 'medium'
      });
    } else {
      const failedLangs = failures.map((f) => f.lang).join(', ');
      cesdk.ui.showNotification({
        type: added > 0 ? 'warning' : 'error',
        message:
          added > 0
            ? `${added} page${added === 1 ? '' : 's'} added; ${failedLangs} failed.`
            : `Translation failed for ${failedLangs}.`,
        duration: 'long'
      });
    }
  } finally {
    engine.block.setState(block, { type: 'Ready' });
  }
}

function findParentPage(
  engine: CreativeEditorSDK['engine'],
  block: number
): number | null {
  let cur: number | null = block;
  while (cur != null) {
    if (engine.block.getType(cur) === '//ly.img.ubq/page') return cur;
    cur = engine.block.getParent(cur);
  }
  return null;
}
```

- [ ] **Step 3: Verify compile**

Run: `npm run check:syntax`.

The wiring in `src/imgly/index.ts` and `src/imgly/plugins/translate/index.ts` still references the OLD `setupTranslatePlugin` opts shape (`proxyUrl`) and the OLD `TRANSLATE_PROVIDERS` / `toAiPluginProvider` / `DEFAULT_PROXY_URL` exports. Those compile errors are expected at this point — Task M4 fixes them. To allow M3 to commit standalone, leave `src/imgly/plugins/translate/index.ts` and `src/imgly/index.ts` failing temporarily, OR stub them in the same comment-out fashion. Choose:

- **Option A (preferred):** stub `index.ts` of the plugin and the editor's `src/imgly/index.ts` minimally so the build passes; M4 expands them.
- **Option B:** skip the syntax check at this commit, accepting that M3 is not standalone-compileable; M4's check covers both.

Pick Option A. Concretely:

```ts
// src/imgly/plugins/translate/index.ts — REPLACE BODY:
import type CreativeEditorSDK from '@cesdk/cesdk-js';
import { setupTranslatePanel } from './panel';
import { installAiCredentials, setConfiguredApiKey } from './credentials';
import { configureTranslate } from './translate';
import { DEFAULT_GATEWAY_URL } from './providers';

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
  setConfiguredApiKey(opts.apiKey);
  installAiCredentials(cesdk);
  configureTranslate({ gatewayUrl });
  setupTranslatePanel(cesdk, { gatewayUrl, apiKey: opts.apiKey });
}

export { TRANSLATE_PANEL_ID, TRANSLATE_DOCK_ID } from './panel';
export { TARGET_LANGUAGES, DEFAULT_GATEWAY_URL } from './providers';
```

For `src/imgly/index.ts`, fix the imports + wiring **right now** since this is the natural place — see Task M4 for the exact diff. (Decision: bundle the wiring update into M3 so M3 produces a fully-compiling, end-to-end working state. M4 then handles docs/env only.)

Apply the `src/imgly/index.ts` change from Task M4 Step 1 below as part of M3, then run `npm run check:syntax`.

- [ ] **Step 4: Commit**

```bash
git add src/imgly/plugins/translate/catalog.ts \
  src/imgly/plugins/translate/panel.ts \
  src/imgly/plugins/translate/index.ts \
  src/imgly/index.ts \
  src/vite-env.d.ts
git commit -m "Migrate Translate to AI Gateway: dynamic catalog + wiring (M3)"
```

---

## Task M4: Env, types, and docs

**Files:**
- Replace: `src/vite-env.d.ts`
- Replace: `.env.example` (only the AI section)
- Modify: `README.md` (Translate section)

(Note: `src/imgly/index.ts` was already updated in M3.)

- [ ] **Step 1: Update `src/imgly/index.ts` (already done in M3, verify)**

Confirm the imports and wiring block now read:

```ts
import {
  CURATED_IMAGE_EDIT_MODEL_IDS,
  DEFAULT_GATEWAY_URL,
  instantiateGatewayProviders
} from './plugins/translate/providers';
import { setupTranslatePlugin } from './plugins/translate';
```

And the in-editor block:

```ts
  // ============================================================================
  // Translate Plugin (custom) + AI Image Generation Plugin (official)
  // ============================================================================

  const apiKey = import.meta.env.VITE_AI_API_KEY ?? '';
  const gatewayUrl =
    import.meta.env.VITE_AI_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;

  if (apiKey) {
    await cesdk.addPlugin(
      ImageGeneration({
        providers: {
          image2image: instantiateGatewayProviders(
            CURATED_IMAGE_EDIT_MODEL_IDS,
            gatewayUrl
          )
        }
      })
    );
  }

  setupTranslatePlugin(cesdk, { apiKey, gatewayUrl });
```

If M3's commit didn't include this exact shape, apply it now and amend the M3 commit:

```bash
git add src/imgly/index.ts
git commit --amend --no-edit
```

- [ ] **Step 2: Replace `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_AI_GATEWAY_URL?: string;
  readonly VITE_CESDK_LICENSE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Replace the AI section of `.env.example`**

The file currently has two sections (CE.SDK License + IMG.LY AI proxy URL). Keep the license section verbatim. Replace the proxy section with:

```
# ==============================================================================
# AI Gateway Configuration
# ==============================================================================
#
# The Translate feature (and the bonus regular image-edit dock entry) talks
# to the IMG.LY AI Gateway — a single endpoint that brokers requests to
# every supported model (fal.ai, OpenAI, Anthropic, ElevenLabs, …). You
# only need one credential.
#
# Create an API key in the IMG.LY dashboard:
#   https://img.ly/dashboard
#
# The key is forwarded to the gateway via `{ dangerouslyExposeApiKey }`.
# This is fine for local development, but DO NOT ship a production build
# with a raw key baked in. In production, mint a short-lived JWT from your
# backend and return it from the `ly.img.ai.getToken` action instead.
# ==============================================================================

# API key from https://img.ly/dashboard.
VITE_AI_API_KEY=

# Optional — override the gateway URL. Defaults to https://gateway.img.ly.
# VITE_AI_GATEWAY_URL=
```

- [ ] **Step 4: Update the Translate section of `README.md`**

Find the existing `## Translate (AI Image Translation)` section. Replace its Configuration subsection and item 6 of the smoke checklist:

Old Configuration:
```
1. Copy `.env.example` to `.env` and set `VITE_IMGLY_AI_PROXY_URL` to your
   IMG.LY proxy URL.
2. Restart the dev server.
```

New Configuration:
```
1. Copy `.env.example` to `.env` and set `VITE_AI_API_KEY` to an API key
   from the [IMG.LY dashboard](https://img.ly/dashboard). (Optionally set
   `VITE_AI_GATEWAY_URL` if you want to point at a non-production gateway.)
2. Restart the dev server.

The starter forwards the key to the gateway via `{ dangerouslyExposeApiKey }`,
which exposes it to anyone with browser DevTools access. This is intentional
for local development only. In production, return a short-lived JWT minted
by your backend from the `ly.img.ai.getToken` action handler instead.
```

Old smoke checklist item 6:
```
6. Unset `VITE_IMGLY_AI_PROXY_URL`, restart the dev server, click Translate
   — clear toast about missing proxy URL.
```

New item 6:
```
6. Unset `VITE_AI_API_KEY`, restart the dev server, click Translate — the
   panel surfaces a clear "AI API key not configured" hint and the
   Translate button is disabled.
```

Also: replace the parenthetical model names in Usage step 3 (currently mentions "Nano Banana Edit, Gemini 2.5 Flash, etc.") with a more accurate phrasing:

```
3. Pick a model from the dropdown — populated dynamically from
   `GET ${gatewayUrl}/v1/models?groupBy=capability` and filtered to
   image-edit capable models.
```

- [ ] **Step 5: Verify compile**

Run: `npm run check:syntax`. Expect clean.

- [ ] **Step 6: Commit**

```bash
git add src/vite-env.d.ts .env.example README.md
# include src/imgly/index.ts ONLY if Step 1 needed an amend
git commit -m "Migrate Translate to AI Gateway: env vars + docs (M4)"
```

---

## Task M5: Final whole-branch review + manual smoke handoff

**Files:** none.

- [ ] **Step 1: Final compile + build**

```bash
npm run check:syntax
npm run build
```

Both must succeed with no errors.

- [ ] **Step 2: Dispatch a final whole-branch code reviewer** comparing HEAD against the migration spec.

- [ ] **Step 3: Address any review findings** with a single follow-up commit if needed.

- [ ] **Step 4: Hand the smoke test to the user** with these instructions:

> 1. Create or copy your IMG.LY API key from https://img.ly/dashboard.
> 2. Copy `.env.example` to `.env` and set `VITE_AI_API_KEY`.
> 3. `npm run dev` and open `http://localhost:5173`.
> 4. Walk the six-item smoke checklist in `README.md` → "Manual smoke checklist".
> 5. Report which items pass / fail. Any failure should include the browser console output for the relevant step.

The user runs Task 8 from the original plan against the migrated branch.

- [ ] **Step 5: After smoke passes, invoke `superpowers:finishing-a-development-branch`.**

---

## Self-Review Notes

- **Spec coverage:** Each goal in the migration spec maps to a task (providers/credentials → M1, HTTP path → M2, dynamic catalog → M3, env/docs → M4, verification → M5).
- **Inter-task compilation:** Mid-migration the codebase is briefly broken; each task includes explicit stubbing or hoisting steps so its own commit compiles standalone.
- **Type consistency:** `TranslateModel` retired; `TranslateCatalogEntry` (in `catalog.ts`) and a bare `modelId: string` (in `translate.ts`) are the new shape. Verified consistent across `translate.ts`, `panel.ts`, `providers.ts`, `catalog.ts`.
- **No-test deviation:** Same as the original plan — explicit per spec.
