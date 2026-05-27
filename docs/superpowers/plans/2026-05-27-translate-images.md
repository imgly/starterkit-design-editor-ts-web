# Translate Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Translate" dock entry to the CE.SDK Design Editor that takes a selected image block with rasterized text and produces one new page per checked target language, each containing a version of the image translated by an image-edit LLM accessed through the IMG.LY proxy/gateway.

**Architecture:** Five focused modules under `src/imgly/plugins/translate/` (providers list, translate adapter, page mutation, custom panel, plugin entry). The official `@imgly/plugin-ai-image-generation-web` plugin is also registered with the same provider list so the editor gains a regular AI image-edit dock entry for free. The custom Translate panel talks to the proxy directly via `@fal-ai/client` and (for OpenAI providers) plain `fetch`.

**Tech Stack:** TypeScript, Vite, CE.SDK 1.75.x (`@cesdk/cesdk-js`, `@cesdk/engine`), `@imgly/plugin-ai-image-generation-web`, `@fal-ai/client`.

**Spec:** [docs/superpowers/specs/2026-05-27-translate-images-design.md](../specs/2026-05-27-translate-images-design.md)

---

## Conventions

- Manual smoke testing only (per spec); no unit tests.
- Commit after each task; one task = one commit. Branch is `add-translate-feature` (already created and holds the spec commit).
- File paths are absolute from the repo root.
- After every code-producing task, run `npm run check:syntax` and verify clean output before committing.

---

## Task 1: Install dependencies and create the feature directory

**Files:**
- Modify: `package.json`
- Create: `src/imgly/plugins/translate/.gitkeep` (placeholder so the empty dir is tracked)

- [ ] **Step 1: Install runtime deps**

```bash
npm install @imgly/plugin-ai-image-generation-web @fal-ai/client
```

- [ ] **Step 2: Create the feature directory**

```bash
mkdir -p src/imgly/plugins/translate
touch src/imgly/plugins/translate/.gitkeep
```

- [ ] **Step 3: Verify TypeScript still compiles**

Run: `npm run check:syntax`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/imgly/plugins/translate/.gitkeep
git commit -m "Add deps for translate feature (@imgly/plugin-ai-image-generation-web, @fal-ai/client)"
```

---

## Task 2: Define the shared provider list

**Files:**
- Create: `src/imgly/plugins/translate/providers.ts`

- [ ] **Step 1: Write the full file**

Create `src/imgly/plugins/translate/providers.ts` with this exact content:

```ts
/**
 * Shared list of image-edit providers available through the IMG.LY gateway.
 *
 * Used in two places:
 *
 * 1. Mapped into provider instances for the official
 *    `@imgly/plugin-ai-image-generation-web` plugin so the editor gets a
 *    regular AI image-edit dock entry "for free".
 * 2. Rendered into the model dropdown of our custom Translate panel.
 *
 * Add a new model here and it shows up in both places.
 */

import FalAiImage from '@imgly/plugin-ai-image-generation-web/fal-ai';
import OpenAiImage from '@imgly/plugin-ai-image-generation-web/open-ai';

export type TranslateProviderKind = 'fal' | 'openai';

export interface TranslateProvider {
  /** Stable id used in dropdown state and dispatch. */
  id: string;
  /** Label shown in the dropdown. */
  label: string;
  /** Which adapter (`translate.ts`) handles it. */
  kind: TranslateProviderKind;
  /** Model identifier the gateway expects (e.g. fal model key). */
  modelKey: string;
}

/**
 * Empty proxy URL means "not configured". Set `VITE_IMGLY_AI_PROXY_URL` in
 * `.env` to override. The default is empty so the missing-URL toast path
 * is exercised when the developer forgets to configure it.
 */
export const DEFAULT_PROXY_URL = '';

export const TRANSLATE_PROVIDERS: TranslateProvider[] = [
  {
    id: 'fal-ai/nano-banana/edit',
    label: 'NanoBananaEdit',
    kind: 'fal',
    modelKey: 'fal-ai/nano-banana/edit'
  },
  {
    id: 'fal-ai/gemini-25-flash-image/edit',
    label: 'Gemini 2.5 Flash Image Edit',
    kind: 'fal',
    modelKey: 'fal-ai/gemini-25-flash-image/edit'
  },
  {
    id: 'fal-ai/gemini-flash-edit',
    label: 'Gemini Flash Edit',
    kind: 'fal',
    modelKey: 'fal-ai/gemini-flash-edit'
  },
  {
    id: 'fal-ai/flux-pro/kontext/edit',
    label: 'Flux Pro Kontext Edit',
    kind: 'fal',
    modelKey: 'fal-ai/flux-pro/kontext/edit'
  },
  {
    id: 'fal-ai/qwen-image-edit',
    label: 'Qwen Image Edit',
    kind: 'fal',
    modelKey: 'fal-ai/qwen-image-edit'
  },
  {
    id: 'fal-ai/bytedance/seedream/v4/edit',
    label: 'Seedream V4 Edit',
    kind: 'fal',
    modelKey: 'fal-ai/bytedance/seedream/v4/edit'
  },
  {
    id: 'openai/gpt-image-1/edit',
    label: 'GPT Image 1',
    kind: 'openai',
    modelKey: 'gpt-image-1'
  }
];

export const DEFAULT_PROVIDER_ID = TRANSLATE_PROVIDERS[0].id;

export function findProvider(id: string): TranslateProvider | undefined {
  return TRANSLATE_PROVIDERS.find((p) => p.id === id);
}

/**
 * Maps a `TranslateProvider` row to the instance shape expected by
 * `@imgly/plugin-ai-image-generation-web`'s `image2image` option.
 *
 * The constructor names exported by the package match the labels we use
 * in the dropdown; the mapping below keeps that linkage in one place.
 */
export function toAiPluginProvider(
  provider: TranslateProvider,
  proxyUrl: string
) {
  switch (provider.id) {
    case 'fal-ai/nano-banana/edit':
      return FalAiImage.NanoBananaEdit({ proxyUrl });
    case 'fal-ai/gemini-25-flash-image/edit':
      return FalAiImage.Gemini25FlashImageEdit({ proxyUrl });
    case 'fal-ai/gemini-flash-edit':
      return FalAiImage.GeminiFlashEdit({ proxyUrl });
    case 'fal-ai/flux-pro/kontext/edit':
      return FalAiImage.FluxProKontextEdit({ proxyUrl });
    case 'fal-ai/qwen-image-edit':
      return FalAiImage.QwenImageEdit({ proxyUrl });
    case 'fal-ai/bytedance/seedream/v4/edit':
      return FalAiImage.SeedreamV4Edit({ proxyUrl });
    case 'openai/gpt-image-1/edit':
      return OpenAiImage.GptImage1.Image2Image({ proxyUrl });
    default:
      throw new Error(`Unknown translate provider id: ${provider.id}`);
  }
}

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
```

- [ ] **Step 2: Verify syntax**

Run: `npm run check:syntax`
Expected: clean exit.

If TypeScript fails because a specific named export (e.g. `Gemini25FlashImageEdit`) does not exist in the installed version of the plugin, drop **only that provider's** row from `TRANSLATE_PROVIDERS` and the matching `switch` case from `toAiPluginProvider`. Note the missing provider in the commit message. Do not invent a substitute.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/providers.ts
git rm --cached src/imgly/plugins/translate/.gitkeep 2>/dev/null || true
git add -A src/imgly/plugins/translate
git commit -m "Add shared provider + language list for translate feature"
```

---

## Task 3: Add the `translate.ts` adapter

**Files:**
- Create: `src/imgly/plugins/translate/translate.ts`

- [ ] **Step 1: Write the full file**

Create `src/imgly/plugins/translate/translate.ts` with this exact content:

```ts
/**
 * Image translation via image-edit LLMs.
 *
 * Pure adapter: takes a source image Blob + target language + provider id,
 * returns the translated image Blob. Knows nothing about CE.SDK.
 */

import { fal } from '@fal-ai/client';
import { findProvider, TranslateProvider } from './providers';

export class TranslateError extends Error {
  constructor(
    message: string,
    public readonly language: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TranslateError';
  }
}

/**
 * One source of truth for the translation prompt. The {language} placeholder
 * is replaced with the English name of the target language.
 */
const PROMPT_TEMPLATE =
  'Translate every piece of visible text in this image to {language}. ' +
  'Preserve the original layout, typography, colors, and visual composition ' +
  'exactly — only replace the text content. Do not add, remove, or restyle ' +
  'anything else.';

function buildPrompt(languagePromptName: string): string {
  return PROMPT_TEMPLATE.replace('{language}', languagePromptName);
}

export interface TranslateImageArgs {
  image: Blob;
  targetLanguageId: string;
  targetLanguagePromptName: string;
  providerId: string;
  proxyUrl: string;
  signal?: AbortSignal;
}

export async function translateImage(
  args: TranslateImageArgs
): Promise<Blob> {
  const provider = findProvider(args.providerId);
  if (!provider) {
    throw new TranslateError(
      `Unknown provider id: ${args.providerId}`,
      args.targetLanguageId,
      args.providerId
    );
  }
  if (!args.proxyUrl) {
    throw new TranslateError(
      'AI proxy URL is not configured.',
      args.targetLanguageId,
      args.providerId
    );
  }

  const prompt = buildPrompt(args.targetLanguagePromptName);

  try {
    switch (provider.kind) {
      case 'fal':
        return await callFalProvider(provider, prompt, args);
      case 'openai':
        return await callOpenAiProvider(provider, prompt, args);
    }
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    throw new TranslateError(
      err instanceof Error ? err.message : 'Translation failed',
      args.targetLanguageId,
      args.providerId,
      err
    );
  }
}

/**
 * Sends a request to the fal.ai proxy using the official client.
 *
 * The fal client is configured with `credentials: () => ''` because the
 * proxy server is responsible for injecting auth headers — the browser
 * never sees the API key.
 */
async function callFalProvider(
  provider: TranslateProvider,
  prompt: string,
  args: TranslateImageArgs
): Promise<Blob> {
  fal.config({
    proxyUrl: args.proxyUrl,
    credentials: () => ''
  });

  // Upload the source image through fal's storage helper. The helper
  // hits the same proxy and returns a CDN URL the model can read.
  const imageFile = new File([args.image], 'source.png', {
    type: args.image.type || 'image/png'
  });
  const imageUrl = await fal.storage.upload(imageFile);

  const result = (await fal.subscribe(provider.modelKey, {
    input: {
      prompt,
      image_url: imageUrl,
      image_urls: [imageUrl]
    },
    logs: false,
    abortSignal: args.signal
  })) as { data?: { images?: { url: string }[]; image?: { url: string } } };

  const outputUrl =
    result?.data?.images?.[0]?.url ?? result?.data?.image?.url;
  if (!outputUrl) {
    throw new TranslateError(
      'Provider returned no image.',
      args.targetLanguageId,
      args.providerId,
      result
    );
  }

  const resp = await fetch(outputUrl, { signal: args.signal });
  if (!resp.ok) {
    throw new TranslateError(
      `Failed to download translated image: ${resp.status}`,
      args.targetLanguageId,
      args.providerId
    );
  }
  return await resp.blob();
}

/**
 * Sends a request to the OpenAI proxy's images/edits endpoint.
 *
 * The proxy is expected to mount OpenAI under `/openai/v1/...` and inject
 * the `Authorization` header. We send multipart/form-data matching the
 * OpenAI images-edit shape.
 */
async function callOpenAiProvider(
  provider: TranslateProvider,
  prompt: string,
  args: TranslateImageArgs
): Promise<Blob> {
  const form = new FormData();
  form.append(
    'image',
    new File([args.image], 'source.png', { type: 'image/png' })
  );
  form.append('prompt', prompt);
  form.append('model', provider.modelKey);
  form.append('n', '1');
  form.append('response_format', 'b64_json');

  const url = `${args.proxyUrl.replace(/\/$/, '')}/openai/v1/images/edits`;
  const resp = await fetch(url, {
    method: 'POST',
    body: form,
    signal: args.signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new TranslateError(
      `OpenAI proxy returned ${resp.status}: ${text}`,
      args.targetLanguageId,
      args.providerId
    );
  }
  const json = (await resp.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = json.data?.[0];
  if (first?.b64_json) {
    return base64ToBlob(first.b64_json, 'image/png');
  }
  if (first?.url) {
    const dl = await fetch(first.url, { signal: args.signal });
    if (!dl.ok) {
      throw new TranslateError(
        `Failed to download translated image: ${dl.status}`,
        args.targetLanguageId,
        args.providerId
      );
    }
    return await dl.blob();
  }
  throw new TranslateError(
    'OpenAI proxy returned no image data.',
    args.targetLanguageId,
    args.providerId
  );
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
```

- [ ] **Step 2: Verify syntax**

Run: `npm run check:syntax`
Expected: clean exit. If `@fal-ai/client`'s default export shape differs (e.g. `import { fal } from '@fal-ai/client'` doesn't exist), check the installed package's types and adjust the import to match — the call pattern (`fal.config`, `fal.storage.upload`, `fal.subscribe`) is stable across versions.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/translate.ts
git commit -m "Add translate.ts adapter (fal + openai) for image translation"
```

---

## Task 4: Add the `pages.ts` scene mutation

**Files:**
- Create: `src/imgly/plugins/translate/pages.ts`

- [ ] **Step 1: Write the full file**

Create `src/imgly/plugins/translate/pages.ts` with this exact content:

```ts
/**
 * Scene mutation helpers for the Translate feature.
 *
 * Pure CE.SDK side: takes a Blob, appends a new page containing only the
 * translated image. Knows nothing about LLMs or HTTP.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export interface AppendTranslatedPageArgs {
  cesdk: CreativeEditorSDK;
  sourcePageId: number;
  translated: Blob;
  /** Used as the new page's name (e.g. "German"). */
  label: string;
}

/**
 * Creates a new page in the same scene as `sourcePageId`, matching its
 * dimensions, and adds one image block that fills the page. The translated
 * Blob is stored as a `buffer://` resource so it lives inside the scene
 * (no `objectURL` that would leak on reload).
 *
 * Caller is responsible for `engine.editor.addUndoStep()` after batching
 * multiple appends — we don't add one per page.
 */
export async function appendTranslatedPage(
  args: AppendTranslatedPageArgs
): Promise<void> {
  const { cesdk, sourcePageId, translated, label } = args;
  const engine = cesdk.engine;

  // 1. Read source dimensions.
  const width = engine.block.getFrameWidth(sourcePageId);
  const height = engine.block.getFrameHeight(sourcePageId);

  // 2. Find the scene and the parent of the source page (page stack /
  // scene root). The new page is appended as a sibling so it lands in
  // the document's page order.
  const parent = engine.block.getParent(sourcePageId);
  if (parent == null) {
    throw new Error('Source page has no parent — cannot append new page.');
  }

  // 3. Stage a buffer:// URI containing the PNG bytes.
  const bufferUri = engine.editor.createBufferURI();
  const arrayBuffer = await translated.arrayBuffer();
  engine.editor.setBufferData(bufferUri, new Uint8Array(arrayBuffer));
  engine.editor.setMimeType(bufferUri, translated.type || 'image/png');

  // 4. Create the new page block with matching dimensions.
  const newPage = engine.block.create('page');
  engine.block.setName(newPage, label);
  engine.block.setWidth(newPage, width);
  engine.block.setHeight(newPage, height);
  engine.block.appendChild(parent, newPage);

  // 5. Create the image block and its image fill, sized to fill the page.
  const imageBlock = engine.block.create('graphic');
  engine.block.setShape(imageBlock, engine.block.createShape('rect'));
  const fill = engine.block.createFill('image');
  engine.block.setSourceSet(fill, 'fill/image/sourceSet', [
    { uri: bufferUri, width, height }
  ]);
  engine.block.setFill(imageBlock, fill);

  engine.block.setPositionX(imageBlock, 0);
  engine.block.setPositionY(imageBlock, 0);
  engine.block.setWidth(imageBlock, width);
  engine.block.setHeight(imageBlock, height);

  engine.block.appendChild(newPage, imageBlock);
}
```

- [ ] **Step 2: Verify syntax**

Run: `npm run check:syntax`
Expected: clean exit.

If TypeScript flags a missing engine method (signatures vary slightly between CE.SDK versions), open the engine's `.d.ts` (`node_modules/@cesdk/engine/dist/*.d.ts`) and adjust the call site. The behavior (create page → set size → append → create image block → set image fill → append to page) does not change.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/pages.ts
git commit -m "Add pages.ts helper to append a translated page to the scene"
```

---

## Task 5: Add the custom Translate panel + dock entry

**Files:**
- Create: `src/imgly/plugins/translate/panel.ts`

- [ ] **Step 1: Write the full file**

Create `src/imgly/plugins/translate/panel.ts` with this exact content:

```ts
/**
 * Custom Translate panel + dock entry.
 *
 * Registers a panel at `//ly.img.panel/translate` and a dock component
 * that opens it. Reads the live block selection; when a single image-fill
 * block is selected, the user can pick a model, check target languages,
 * and trigger translation. Output is appended as new pages in the scene.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  DEFAULT_PROVIDER_ID,
  TARGET_LANGUAGES,
  TRANSLATE_PROVIDERS,
  findProvider
} from './providers';
import { translateImage, TranslateError } from './translate';
import { appendTranslatedPage } from './pages';

export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
export const TRANSLATE_DOCK_ID = 'ly.img.translate.dock';

export interface SetupTranslatePanelOpts {
  proxyUrl: string;
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
      'panel.translate.languages': 'Target languages',
      'panel.translate.translate': 'Translate',
      'panel.translate.cancel': 'Cancel',
      'panel.translate.translating': 'Translating…',
      'panel.translate.hint.noSelection':
        'Select an image block to translate.',
      'panel.translate.hint.noLanguages':
        'Choose at least one target language.',
      'panel.translate.hint.noProxy':
        'AI proxy URL not configured. Set VITE_IMGLY_AI_PROXY_URL in .env.',
      'libraries.ly.img.translate.label': 'Translate'
    }
  });
}

function registerPanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  cesdk.ui.registerPanel(TRANSLATE_PANEL_ID, ({ builder, engine, state }) => {
    // Reactive panel state.
    const providerId = state('translate.providerId', DEFAULT_PROVIDER_ID);
    const checked = state<Record<string, boolean>>(
      'translate.languages',
      {}
    );
    const isRunning = state('translate.isRunning', false);

    // Stable handle to the current run's AbortController, kept outside
    // reactive state so calling .abort() doesn't re-render the panel.
    const controllerRef = controllerHolder(cesdk);

    const selection = engine.block.findAllSelected();
    const selectedImageBlock = pickImageFillBlock(engine, selection);
    const selectedLanguages = TARGET_LANGUAGES.filter(
      (lang) => checked.value[lang.id]
    );

    const proxyConfigured = opts.proxyUrl.length > 0;

    const disabledReason = !proxyConfigured
      ? 'panel.translate.hint.noProxy'
      : selectedImageBlock == null
      ? 'panel.translate.hint.noSelection'
      : selectedLanguages.length === 0
      ? 'panel.translate.hint.noLanguages'
      : null;

    builder.Section('translate.section', {
      title: 'panel.translate.title',
      children: () => {
        builder.Select('translate.model', {
          inputLabel: 'panel.translate.model',
          values: TRANSLATE_PROVIDERS.map((p) => ({
            id: p.id,
            label: p.label
          })),
          ...providerId
        });

        for (const lang of TARGET_LANGUAGES) {
          builder.Checkbox(`translate.lang.${lang.id}`, {
            inputLabel: lang.label,
            value: !!checked.value[lang.id],
            setValue: (v: boolean) =>
              checked.setValue({ ...checked.value, [lang.id]: v })
          });
        }

        if (disabledReason) {
          builder.Text('translate.hint', {
            content: disabledReason
          });
        }

        if (isRunning.value) {
          builder.Button('translate.cancel', {
            label: 'panel.translate.cancel',
            color: 'danger',
            onClick: () => {
              controllerRef.get()?.abort();
            }
          });
        } else {
          builder.Button('translate.go', {
            label: 'panel.translate.translate',
            color: 'accent',
            isDisabled: disabledReason != null,
            onClick: () => {
              const block = selectedImageBlock;
              if (!block) return;
              const controller = new AbortController();
              controllerRef.set(controller);
              isRunning.setValue(true);
              void runTranslation({
                cesdk,
                proxyUrl: opts.proxyUrl,
                providerId: providerId.value,
                block,
                languages: selectedLanguages,
                signal: controller.signal
              }).finally(() => {
                isRunning.setValue(false);
                controllerRef.set(null);
              });
            }
          });
        }
      }
    });
  });
}

function registerDockEntry(cesdk: CreativeEditorSDK): void {
  cesdk.ui.registerComponent(
    TRANSLATE_DOCK_ID,
    ({ builder }) => {
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
    }
  );

  // Append the entry to the existing dock order. We add at the end so we
  // don't disturb the layout configured in design-editor/ui/dock.ts.
  cesdk.ui.insertOrderComponent(
    { in: 'ly.img.dock', position: 'end' },
    TRANSLATE_DOCK_ID
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the single block iff it is an image-fill carrier; else null.
 */
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

/**
 * Stores an AbortController instance on the CE.SDK ui so callbacks can
 * read/write it without using reactive panel state (which would re-render).
 */
function controllerHolder(cesdk: CreativeEditorSDK) {
  const key = '__translatePanelController';
  const w = cesdk as unknown as Record<string, AbortController | null>;
  return {
    get: () => w[key] ?? null,
    set: (c: AbortController | null) => {
      w[key] = c;
    }
  };
}

interface RunArgs {
  cesdk: CreativeEditorSDK;
  proxyUrl: string;
  providerId: string;
  block: number;
  languages: typeof TARGET_LANGUAGES;
  signal: AbortSignal;
}

async function runTranslation(args: RunArgs): Promise<void> {
  const { cesdk, proxyUrl, providerId, block, languages, signal } = args;
  const engine = cesdk.engine;
  const provider = findProvider(providerId);
  if (!provider) return;

  // 1. Capture source state synchronously.
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

  // 2. Export source once.
  let sourceBlob: Blob;
  try {
    sourceBlob = await engine.block.export(fill, 'image/png' as never);
  } catch (err) {
    console.error('Failed to export source image:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Failed to read the source image.',
      duration: 'medium'
    });
    return;
  }

  // 3. Set busy state on the block too (visual progress indicator).
  engine.block.setState(block, { type: 'Pending', progress: 0 });

  // 4. Fan out per language.
  const results = await Promise.allSettled(
    languages.map((lang) =>
      translateImage({
        image: sourceBlob,
        targetLanguageId: lang.id,
        targetLanguagePromptName: lang.promptName,
        providerId,
        proxyUrl,
        signal
      }).then((blob) => ({ lang, blob }))
    )
  );

  // 5. If the run was cancelled, skip the commit phase entirely.
  if (signal.aborted) {
    engine.block.setState(block, { type: 'Ready' });
    cesdk.ui.showNotification({
      type: 'info',
      message: 'Translation cancelled.',
      duration: 'short'
    });
    return;
  }

  // 6. Sequential commit in original language order.
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

  // 7. Single undo step covers the whole batch.
  if (added > 0) {
    engine.editor.addUndoStep();
  }
  engine.block.setState(block, { type: 'Ready' });

  // 8. One combined toast.
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
}

/**
 * Walks up the parent chain to find the page block that contains `block`.
 */
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

- [ ] **Step 2: Verify syntax**

Run: `npm run check:syntax`
Expected: clean exit.

Likely adjustments by builder API version:

- If `builder.Text` is unavailable in this CE.SDK version, replace the hint with `builder.Section('translate.hint.section', { title: disabledReason, children: () => {} })` or drop the inline hint entirely (the disabled button is enough).
- If `builder.Select` uses a different prop name than `values` (e.g. `options`), adapt — the shape `{id, label}[]` is stable.
- If `engine.block.export(fill, 'image/png')` rejects the literal string at compile time, import `'@cesdk/engine'` and use `MimeType.Png` (or the matching constant exported from that package); the cast `as never` is a transitional hack — replace it.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/panel.ts
git commit -m "Add custom translate panel + dock entry"
```

---

## Task 6: Add the plugin entry and wire it into the editor

**Files:**
- Create: `src/imgly/plugins/translate/index.ts`
- Modify: `src/imgly/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the plugin entry**

Create `src/imgly/plugins/translate/index.ts`:

```ts
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

export interface SetupTranslatePluginOpts {
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
  }
  setupTranslatePanel(cesdk, opts);
}

export { TRANSLATE_PANEL_ID, TRANSLATE_DOCK_ID } from './panel';
export { TRANSLATE_PROVIDERS, TARGET_LANGUAGES } from './providers';
```

- [ ] **Step 2: Wire into `src/imgly/index.ts`**

Open `src/imgly/index.ts`. Add these imports near the existing imports (after the line `import { setupBackgroundRemovalPlugin } from './plugins/background-removal';`):

```ts
import ImageGeneration from '@imgly/plugin-ai-image-generation-web';
import {
  TRANSLATE_PROVIDERS,
  toAiPluginProvider,
  DEFAULT_PROXY_URL
} from './plugins/translate/providers';
import { setupTranslatePlugin } from './plugins/translate';
```

Then, inside `initDesignEditor`, immediately after the `setupBackgroundRemovalPlugin(cesdk);` line, add:

```ts
  // ============================================================================
  // Translate Plugin (custom) + AI Image Generation Plugin (official)
  // ============================================================================

  const proxyUrl =
    (import.meta.env.VITE_IMGLY_AI_PROXY_URL as string | undefined) ??
    DEFAULT_PROXY_URL;

  // Official AI image plugin — gives the editor a regular AI image-edit
  // dock entry. Same provider list as the Translate panel below.
  if (proxyUrl) {
    await cesdk.addPlugin(
      ImageGeneration({
        image2image: TRANSLATE_PROVIDERS.map((p) =>
          toAiPluginProvider(p, proxyUrl)
        )
      })
    );
  }

  // Custom Translate plugin — adds the dock entry + side panel that
  // produces one new page per checked target language.
  setupTranslatePlugin(cesdk, { proxyUrl });
```

- [ ] **Step 3: Make sure Vite knows about the env var type**

If `import.meta.env.VITE_IMGLY_AI_PROXY_URL` triggers a TS error, add (or create) `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IMGLY_AI_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Verify syntax**

Run: `npm run check:syntax`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add src/imgly/index.ts src/imgly/plugins/translate/index.ts src/vite-env.d.ts
git commit -m "Wire translate plugin + AI image plugin into the editor"
```

---

## Task 7: Document configuration and the manual smoke test

**Files:**
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Create `.env.example`**

```
# IMG.LY AI proxy URL — required for the Translate dock entry and the
# regular AI image-edit features (powered by @imgly/plugin-ai-image-generation-web).
#
# The proxy is responsible for injecting your API keys server-side. Never
# put raw provider keys in the browser. See:
#   https://img.ly/docs/cesdk/js/user-interface/ai-integration/proxy-server/
#
# Example: https://your-proxy.example.com/api/proxy
VITE_IMGLY_AI_PROXY_URL=
```

- [ ] **Step 2: Append a Translate section to `README.md`**

Append the following to the end of `README.md`, right before the `## License` heading:

```markdown
## Translate (AI Image Translation)

The Translate dock entry takes a selected image block with rasterized text
and produces one new page per checked target language, each containing the
image with text translated by an image-edit LLM.

### Configuration

1. Copy `.env.example` to `.env` and set `VITE_IMGLY_AI_PROXY_URL` to your
   IMG.LY proxy URL.
2. Restart the dev server.

### Usage

1. Open the editor and select an image block (one with a raster image fill).
2. Click the **Translate** entry in the dock.
3. Pick a model from the dropdown (Nano Banana Edit, Gemini 2.5 Flash, etc.).
4. Check the target languages (German, English, Spanish, Russian, Chinese).
5. Click **Translate**.

For each checked language, a new page is appended to the document containing
only the translated image. The source page is left unchanged. The whole batch
is one undo step.

### Manual smoke checklist

1. Open the editor, load the default marketing scene, select the image block.
2. Open the Translate dock entry — panel opens, model dropdown populated,
   no languages checked, Translate button disabled with inline hint.
3. Check German, click Translate — one new page appended; original page
   unchanged; ⌘Z / Ctrl+Z undoes the new page.
4. Re-select source image, check three languages, click Translate — three
   new pages appended in checked order.
5. During a run, click Cancel — no pages appended; toast confirms.
6. Unset `VITE_IMGLY_AI_PROXY_URL`, restart the dev server, click Translate
   — clear toast about missing proxy URL.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "Document VITE_IMGLY_AI_PROXY_URL and the translate smoke checklist"
```

---

## Task 8: End-to-end manual smoke test

**Files:** none — this task is verification only.

- [ ] **Step 1: Configure the proxy**

Copy `.env.example` → `.env`, set `VITE_IMGLY_AI_PROXY_URL` to a working IMG.LY proxy URL. If you don't have one, ask the project owner.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:5173`.

- [ ] **Step 3: Run the smoke checklist from the README**

Walk through all six items in `README.md`'s "Manual smoke checklist". For each item, note the actual outcome.

- [ ] **Step 4: If anything fails, debug and fix**

If a checklist item fails, do **not** invent workarounds — read the error in the browser console, fix the offending file, repeat the affected steps. Recommit any code changes with a clear message referencing what failed.

- [ ] **Step 5: Final commit (only if there were fixes)**

```bash
git add -A
git commit -m "Fix <issue> uncovered by manual smoke test"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin add-translate-feature
```

---

## Self-Review Notes (resolved before publishing this plan)

- **Spec coverage:** every spec section is mapped to a task — providers (Task 2), translate adapter (Task 3), page mutation (Task 4), panel + dock entry (Task 5), plugin entry + wiring (Task 6), config and verification (Tasks 7 & 8).
- **Placeholders:** none — code blocks are complete. Where APIs are version-sensitive (Select prop names, MimeType import, builder.Text availability), the plan calls out the *known* adjustment to try rather than handwaving.
- **Type consistency:** `TranslateProvider`, `TARGET_LANGUAGES`, `TRANSLATE_PANEL_ID`, `TRANSLATE_DOCK_ID`, `appendTranslatedPage`, `translateImage` all reference the same names where used across modules.
- **No-test deviation from default TDD:** explicit per spec — the editor's UI isn't unit-testable in this starter kit and manual smoke is documented as the verification gate.
