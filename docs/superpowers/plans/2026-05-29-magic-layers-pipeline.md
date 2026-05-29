# Magic Layers pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Magic Layers translation pipeline end-to-end. One gateway call to `imgly/image-to-scene` produces an editable scene; loaded N times, one per language. Text content is batch-translated via `openai/gpt-5.4-mini` so the model sees cross-block context and produces consistent terminology. One translated page per language is appended to the document. The Magic Layers Translate button stops being a no-op.

**Architecture:** A new orchestrator (`magicLayers.ts`) drives the per-Translate-click flow: export source PNG → image-to-scene → for each language in parallel, load a fresh copy of the scene, collect text blocks recursively, call a new batch text adapter (`translateTexts.ts`) once with the full string array, replace each text in place, append the page as a sibling of the source page. The panel switches between the existing `runTranslation` (direct) and the new `runMagicLayersTranslation` based on `opts.pipeline`; the disabled-button + `notImplemented` UI branches added in the previous spec are removed.

**Tech Stack:** TypeScript, CE.SDK 1.75.x (`@cesdk/cesdk-js`), `@imgly/plugin-ai-generation-web` for the gateway client. Two gateway models: `imgly/image-to-scene` (URL output, returns scene archive data URL) and `openai/gpt-5.4-mini` (streaming text). No automated tests (per project convention); verification is `npm run check:syntax` (= `tsc --noEmit`) after each task plus a manual smoke check at the end.

**Reference spec:** [docs/superpowers/specs/2026-05-29-magic-layers-pipeline-design.md](../specs/2026-05-29-magic-layers-pipeline-design.md).

**Per-task verification:** every task ends with `npm run check:syntax` followed by a commit. The project must build cleanly at every step.

---

## Task 1: Add the model id + drop "Coming soon"

**Files:**
- Modify: `src/imgly/plugins/translate/providers.ts`

The image-to-scene model id sits next to the existing image-edit models, since the pipeline domain owns it. The Magic Layers radio description loses its `(Coming soon)` suffix because the pipeline now does something.

- [ ] **Step 1: Append the model id constant to `providers.ts`**

Open `src/imgly/plugins/translate/providers.ts`. Find the `TRANSLATE_MODELS` block (ends with `] as const;` near line 41). Just after that block and before `export type TranslatePipeline`, insert:

```typescript

/**
 * Gateway model id for the Magic Layers image-to-scene pipeline.
 * Takes a source image + returns a scene archive (zip) with editable
 * layers — including text blocks — that the host scene loads via
 * `engine.block.loadFromArchiveURL`.
 */
export const MAGIC_LAYERS_MODEL_ID = 'imgly/image-to-scene';
```

- [ ] **Step 2: Drop "(Coming soon)" from the Magic Layers description**

In the same file, find the `magic-layers` entry inside `TRANSLATE_PIPELINES` (around line 60). Replace its `description` value. The current entry reads:

```typescript
  {
    id: 'magic-layers',
    label: 'IMG.LY Magic Layers',
    description:
      'Editable text, faster & cheaper for more than 2 translations. (Coming soon)'
  }
```

Replace with:

```typescript
  {
    id: 'magic-layers',
    label: 'IMG.LY Magic Layers',
    description:
      'Editable text, faster & cheaper for more than 2 translations.'
  }
```

- [ ] **Step 3: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/imgly/plugins/translate/providers.ts
git commit -m "Add MAGIC_LAYERS_MODEL_ID; drop Coming soon from radio copy"
```

---

## Task 2: Expose the gateway client singleton from `translate.ts`

**Files:**
- Modify: `src/imgly/plugins/translate/translate.ts`

The orchestrator and text adapter both need access to the configured `GatewayClient`. Today, `translate.ts` keeps it as a module-level `let client`. Add a thin accessor so consumers can reuse the singleton without re-running `createGatewayClient`.

- [ ] **Step 1: Add the accessor**

Open `src/imgly/plugins/translate/translate.ts`. Find the `configureTranslate` function (around line 44). Immediately after its closing brace, insert:

```typescript

/**
 * Return the configured gateway client, or null if `configureTranslate`
 * has not been called yet. Used by sibling modules (the Magic Layers
 * orchestrator, the text-translation adapter) that share the same
 * gateway and token resolution.
 */
export function getGatewayClient(): GatewayClient | null {
  return client;
}
```

The `GatewayClient` type is already imported at the top of the file.

- [ ] **Step 2: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/translate.ts
git commit -m "Expose getGatewayClient() from translate.ts"
```

---

## Task 3: Add the batch text-translation adapter

**Files:**
- Create: `src/imgly/plugins/translate/translateTexts.ts`

Pure gateway adapter. Knows nothing about CE.SDK. Takes an array of strings, returns the same-length array of translated strings via `openai/gpt-5.4-mini`. Throws on any structural drift in the model's response — the throw flows up to `Promise.allSettled` in the orchestrator and marks that language as failed.

- [ ] **Step 1: Create the file**

Create `src/imgly/plugins/translate/translateTexts.ts` with the content below.

```typescript
/**
 * Batch text translation via the IMG.LY AI Gateway.
 *
 * Pure adapter: takes an array of strings + target language, returns
 * an array of translated strings via `openai/gpt-5.4-mini`. Throws on
 * any structural drift in the response (non-JSON, wrong length, non-
 * string entries) so the call site can mark the language as failed.
 *
 * The model is asked to translate the whole array in one shot. Cross-
 * block context yields more consistent terminology and register than N
 * independent per-block calls — see the Magic Layers spec for rationale.
 */

import { getGatewayClient } from './translate';

const TEXT_MODEL_ID = 'openai/gpt-5.4-mini';

const SYSTEM_PROMPT =
  'You are a translator. Translate every item in the JSON array below into ' +
  '{language}. Preserve tone and register; use consistent terminology across ' +
  'items (they are pieces of one design). Respond with ONLY a JSON array of ' +
  'strings, in the same order and same length as the input. Do not wrap the ' +
  'array in markdown or add commentary.';

export interface TranslateTextsArgs {
  texts: string[];
  /** Human-readable language name fed to the prompt (e.g. "German"). */
  targetLanguagePromptName: string;
}

export async function translateTexts(
  args: TranslateTextsArgs
): Promise<string[]> {
  if (args.texts.length === 0) return [];

  const client = getGatewayClient();
  if (!client) {
    throw new Error('translateTexts: gateway client not configured');
  }

  const prompt =
    SYSTEM_PROMPT.replace('{language}', args.targetLanguagePromptName) +
    '\n\nInput:\n' +
    JSON.stringify(args.texts);

  // Drain the stream — generateStream returns the final accumulated
  // text as the AsyncGenerator's return value. `for await…of` only
  // sees intermediate yields, so we iterate manually.
  const stream = client.generateStream(TEXT_MODEL_ID, { prompt }, {});
  let final = '';
  while (true) {
    const { value, done } = await stream.next();
    if (done) {
      final = value;
      break;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(final);
  } catch {
    throw new Error(
      `translateTexts: model returned non-JSON (${final.slice(0, 80)}…)`
    );
  }
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
    throw new Error(
      `translateTexts: model returned non-string-array: ${final.slice(0, 80)}…`
    );
  }
  if (parsed.length !== args.texts.length) {
    throw new Error(
      `translateTexts: expected ${args.texts.length} items, got ${parsed.length}`
    );
  }
  return parsed as string[];
}
```

- [ ] **Step 2: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/translateTexts.ts
git commit -m "Add batch text-translation adapter (openai/gpt-5.4-mini)"
```

---

## Task 4: Add the Magic Layers orchestrator

**Files:**
- Create: `src/imgly/plugins/translate/magicLayers.ts`

CE.SDK-side orchestrator. Mirrors the direct pipeline's runTranslation in shape: takes a source block + language list, runs the gateway calls, mutates the scene, addUndoStep on success, surfaces a notification at the end.

- [ ] **Step 1: Create the file**

Create `src/imgly/plugins/translate/magicLayers.ts` with the content below.

```typescript
/**
 * Magic Layers translation pipeline.
 *
 * One `imgly/image-to-scene` gateway call produces an editable scene
 * archive. We load that archive N times — once per target language —
 * collect every text block in the loaded scene, batch-translate the
 * strings via the text gateway adapter, replace each text in place,
 * and append the result as a new page beside the source page.
 *
 * Pure orchestrator on top of `translateTexts` (gateway) and the
 * CE.SDK engine. Failure mode mirrors the direct pipeline: per-language
 * `Promise.allSettled`; a failure in any one language does not block
 * the others.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { getGatewayClient } from './translate';
import { translateTexts } from './translateTexts';
import { MAGIC_LAYERS_MODEL_ID, type TargetLanguage } from './providers';

export interface RunMagicLayersTranslationArgs {
  cesdk: CreativeEditorSDK;
  /** The source image block the user selected (or the fallback). */
  block: number;
  languages: readonly TargetLanguage[];
}

export async function runMagicLayersTranslation(
  args: RunMagicLayersTranslationArgs
): Promise<void> {
  const { cesdk, block, languages } = args;
  const engine = cesdk.engine;

  const sourcePageId = findParentPage(engine, block);
  if (sourcePageId == null) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not find the source page.',
      duration: 'medium'
    });
    return;
  }
  const sceneParent = engine.block.getParent(sourcePageId);
  if (sceneParent == null) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Source page has no parent — cannot append translated pages.',
      duration: 'medium'
    });
    return;
  }

  const client = getGatewayClient();
  if (!client) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'AI gateway is not configured.',
      duration: 'medium'
    });
    return;
  }

  // 1. Export the selected image block as PNG and upload it.
  let sceneArchiveUrl: string;
  engine.block.setState(block, { type: 'Pending', progress: 0 });
  try {
    const sourceBlob = await engine.block.export(block, {
      mimeType: 'image/png'
    });
    const upload = await client.upload(sourceBlob, 'image/png');

    // 2. Single image-to-scene call. The gateway returns a data URL
    //    pointing at the scene archive (zip). We pass it N times to
    //    loadFromArchiveURL below — each call gets a fresh copy of
    //    the scene to mutate independently.
    sceneArchiveUrl = await client.generate(
      MAGIC_LAYERS_MODEL_ID,
      {
        image_url: upload.asset_url,
        image_urls: [upload.asset_url]
      },
      {}
    );
  } catch (err) {
    console.error('Magic Layers: image-to-scene failed:', err);
    engine.block.setState(block, { type: 'Ready' });
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Magic Layers: scene generation failed.',
      duration: 'medium'
    });
    return;
  }

  // 3. Per-language work — each language runs end-to-end independently.
  try {
    const results = await Promise.allSettled(
      languages.map((lang) =>
        translateOneLanguage({
          engine,
          sceneArchiveUrl,
          sceneParent,
          lang
        })
      )
    );

    const failures: { lang: string; error: unknown }[] = [];
    let added = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const lang = languages[i];
      if (r.status === 'fulfilled') {
        added++;
      } else {
        console.error(`Magic Layers failed for ${lang.label}:`, r.reason);
        failures.push({ lang: lang.label, error: r.reason });
      }
    }

    if (added > 0) engine.editor.addUndoStep();

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
            : `Magic Layers translation failed for ${failedLangs}.`,
        duration: 'long'
      });
    }
  } finally {
    engine.block.setState(block, { type: 'Ready' });
  }
}

interface TranslateOneArgs {
  engine: CreativeEditorSDK['engine'];
  sceneArchiveUrl: string;
  sceneParent: number;
  lang: TargetLanguage;
}

async function translateOneLanguage(args: TranslateOneArgs): Promise<void> {
  const { engine, sceneArchiveUrl, sceneParent, lang } = args;

  // Each call gets a fresh, independent copy of the model's scene.
  const loaded = await engine.block.loadFromArchiveURL(sceneArchiveUrl);
  const page = loaded[0];
  if (page == null) {
    throw new Error('loadFromArchiveURL returned no blocks');
  }

  // Recursively collect every text block under the loaded page.
  const textBlocks: number[] = [];
  collectTextBlocks(engine, page, textBlocks);

  if (textBlocks.length > 0) {
    const originals = textBlocks.map((tb) =>
      engine.block.getString(tb, 'text/text')
    );
    const translated = await translateTexts({
      texts: originals,
      targetLanguagePromptName: lang.promptName
    });
    // Length match is already enforced by translateTexts.
    for (let i = 0; i < textBlocks.length; i++) {
      engine.block.replaceText(textBlocks[i], translated[i]);
    }
  }

  engine.block.setName(page, lang.label);
  engine.block.appendChild(sceneParent, page);
}

function collectTextBlocks(
  engine: CreativeEditorSDK['engine'],
  root: number,
  acc: number[]
): void {
  if (engine.block.getType(root).endsWith('/text')) {
    acc.push(root);
  }
  for (const child of engine.block.getChildren(root)) {
    collectTextBlocks(engine, child, acc);
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

- [ ] **Step 2: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/imgly/plugins/translate/magicLayers.ts
git commit -m "Add Magic Layers orchestrator (image-to-scene + batch text)"
```

---

## Task 5: Wire the panel dispatch

**Files:**
- Modify: `src/imgly/plugins/translate/panel.ts`

The panel stops treating Magic Layers as disabled. The disabled flag, the `notImplemented` hint branch, the `isMagicLayers` early-return, and the `notImplemented` i18n key all come out. The Translate button's `onClick` dispatches on `opts.pipeline`. The model selector is still hidden for Magic Layers (the gateway exposes a single image-to-scene model, no UI choice).

- [ ] **Step 1: Add the orchestrator import**

Open `src/imgly/plugins/translate/panel.ts`. Find the existing import block near the top. The current imports for the translate module read:

```typescript
import { translateImage, TranslateError } from './translate';
import { appendTranslatedPage } from './pages';
```

(They live near the `TRANSLATE_MODELS` import. Confirm by reading the file's top.) Add the Magic Layers import directly after them:

```typescript
import { runMagicLayersTranslation } from './magicLayers';
```

- [ ] **Step 2: Remove the `notImplemented` i18n key**

Find `registerTranslations` (around line 42). The current `en` block contains:

```typescript
      'panel.translate.hint.noApiKey':
        'AI API key not configured. Set VITE_AI_API_KEY in .env.',
      'panel.translate.hint.notImplemented':
        'Magic Layers translation is coming soon.',
      'libraries.ly.img.translate.label': 'Translate'
```

Remove the two `notImplemented` lines so the block reads:

```typescript
      'panel.translate.hint.noApiKey':
        'AI API key not configured. Set VITE_AI_API_KEY in .env.',
      'libraries.ly.img.translate.label': 'Translate'
```

- [ ] **Step 3: Replace the `registerPanel` body**

Inside `registerPanel`, replace the entire `cesdk.ui.registerPanel(TRANSLATE_PANEL_ID, ({ builder, engine, state }) => { ... });` body with the version below. (Same overall shape as today; only the hint branch, the `isDisabled` expression, and the `onClick` dispatch change.)

```typescript
  cesdk.ui.registerPanel(TRANSLATE_PANEL_ID, ({ builder, engine, state }) => {
    const apiKeyConfigured = opts.apiKey.length > 0;
    const isMagicLayers = opts.pipeline === 'magic-layers';

    const modelId = state<string>('translate.modelId', TRANSLATE_MODELS[0].id);
    const checked = state<Record<string, boolean>>(
      'translate.languages',
      {}
    );
    const isRunning = state('translate.isRunning', false);

    const selection = engine.block.findAllSelected();
    // Selection wins; if the user hasn't selected an image block (or has
    // selected something else, like a page or text), fall back to the
    // first-page image — the original upload — so a stray click outside
    // the image doesn't break the workflow.
    const selectedImageBlock =
      pickImageFillBlock(engine, selection) ??
      findFirstImageBlockOnFirstPage(engine);
    const selectedLanguages = TARGET_LANGUAGES.filter(
      (lang) => checked.value[lang.id]
    );

    const dropdownValues = TRANSLATE_MODELS.map((m) => ({
      id: m.id,
      label: m.label
    }));
    const selectValue =
      dropdownValues.find((v) => v.id === modelId.value) ?? dropdownValues[0];
    const effectiveModelId = selectValue.id;

    builder.Section('translate.section', {
      children: () => {
        if (!apiKeyConfigured) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate('panel.translate.hint.noApiKey')
          });
          return;
        }
        if (selectedImageBlock == null) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate('panel.translate.hint.noSelection')
          });
          return;
        }

        // Model selector — Direct pipeline only. Magic Layers exposes
        // a single image-to-scene model on the gateway; no UI choice.
        if (!isMagicLayers) {
          builder.Select('translate.model', {
            inputLabel: 'panel.translate.model',
            values: dropdownValues,
            value: selectValue,
            setValue: (v: { id: string; label: string }) =>
              modelId.setValue(v.id)
          });
        }

        for (const lang of TARGET_LANGUAGES) {
          builder.Checkbox(`translate.lang.${lang.id}`, {
            inputLabel: lang.label,
            inputLabelPosition: 'right',
            value: !!checked.value[lang.id],
            setValue: (v: boolean) =>
              checked.setValue({ ...checked.value, [lang.id]: v })
          });
        }

        if (selectedLanguages.length === 0) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate('panel.translate.hint.noLanguages')
          });
        }

        builder.Button('translate.go', {
          label: 'panel.translate.translate',
          color: 'accent',
          isLoading: isRunning.value,
          isDisabled: isRunning.value || selectedLanguages.length === 0,
          onClick: () => {
            const block = selectedImageBlock;
            if (!block) return;
            isRunning.setValue(true);
            const run = isMagicLayers
              ? runMagicLayersTranslation({
                  cesdk,
                  block,
                  languages: selectedLanguages
                })
              : runTranslation({
                  cesdk,
                  modelId: effectiveModelId,
                  block,
                  languages: selectedLanguages
                });
            void run.finally(() => {
              isRunning.setValue(false);
            });
          }
        });
      }
    });
  });
```

- [ ] **Step 4: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 5: Manual smoke check**

```bash
npm run dev
```

Open `http://localhost:5173` and run through both pipelines:

**Direct pipeline (regression check):**
1. Drop an image with text; leave "Direct" selected; Continue.
2. In the Translate panel, check that the Model dropdown is present and the language checkboxes work as before.
3. Pick one or more languages, click Translate. Confirm the existing direct-pipeline flow still runs end-to-end (a new page per language appears).
4. Back to upload.

**Magic Layers pipeline (new):**
1. Drop the same image; select "IMG.LY Magic Layers"; Continue.
2. In the Translate panel, confirm the Model dropdown is **not** visible.
3. With no languages checked: "Choose at least one target language." hint shows; Translate button is disabled. (Confirms the previous `notImplemented` UI is gone.)
4. Check one language (e.g. German). Translate button enables; click it.
5. Confirm progression: the source block enters Pending state (spinner / overlay). After ~10–30s a success notification appears and a new page named "German" is added.
6. Verify the translated page's text blocks are editable and contain the translated content (or, if the text gateway path is still being calibrated, the prompt-shaped output).
7. Check multiple languages at once; confirm one image-to-scene call followed by N text translations and N pages appended; one undo step rolls them all back.
8. (Failure-mode check, optional) Temporarily corrupt `TEXT_MODEL_ID` in `translateTexts.ts` to something invalid, re-run; confirm the per-language failure shows up in the notification while other languages (if any) still succeed.

Stop the dev server (Ctrl-C).

- [ ] **Step 6: Commit**

```bash
git add src/imgly/plugins/translate/panel.ts
git commit -m "Dispatch Magic Layers from the Translate panel"
```

---

## Task 6: Update the README

**Files:**
- Modify: `README.md`

Magic Layers is no longer "coming soon." Update the Pipelines copy and add a short note in the Models section about the text model.

- [ ] **Step 1: Update the Pipelines bullet for Magic Layers**

Open `README.md`. Find the "Pipelines" section (added in the previous spec). The current Magic Layers bullet reads:

```markdown
- **IMG.LY Magic Layers** — image-to-scene transformation that returns
  editable scene files. Editable text, faster and cheaper for more than
  two translations. *Coming soon* — until the gateway model ships, picking
  this pipeline shows the Translate panel without the model selector and
  with a disabled Translate button.
```

Replace with:

```markdown
- **IMG.LY Magic Layers** — image-to-scene transformation that returns
  an editable scene per language. The pipeline makes one
  `imgly/image-to-scene` gateway call to convert the source image into a
  scene with text layers, then batch-translates each language's text
  blocks in one shot via `openai/gpt-5.4-mini` so the model sees the full
  set of strings together (consistent terminology, lower cost). Edit any
  translated text directly in the resulting page.
```

- [ ] **Step 2: Append a Models note**

In the same file, find the "### Models (Direct pipeline)" section and the model table. After that table block (just before "### Configuration"), insert:

```markdown

The Magic Layers pipeline uses two fixed gateway models instead — there is
no UI choice:

| Model              | Gateway id                  | Used for                |
|--------------------|-----------------------------|-------------------------|
| Image-to-scene     | `imgly/image-to-scene`      | Source image → scene    |
| GPT 5.4 Mini       | `openai/gpt-5.4-mini`       | Batch text translation  |
```

- [ ] **Step 3: Type-check (sanity)**

```bash
npm run check:syntax
```

Expected: exits 0. (README changes shouldn't affect TS, but this confirms the working tree still builds.)

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the Magic Layers pipeline and its gateway models"
```

---

## Done

After Task 6 commits, the branch contains:

1. A concrete `imgly/image-to-scene` model id in `providers.ts`.
2. A `getGatewayClient()` accessor on the existing `translate.ts`.
3. A new `translateTexts.ts` batch text adapter targeting `openai/gpt-5.4-mini`, with structural-drift validation.
4. A new `magicLayers.ts` orchestrator: one image-to-scene call, N scene loads, per-language batch text translation, N pages appended.
5. A panel dispatch that routes Direct → existing `runTranslation` and Magic Layers → new `runMagicLayersTranslation`. The previous "coming soon" UI branches are gone.
6. README documentation reflecting the live pipeline and its model set.

The user-facing change: picking Magic Layers on the upload screen now produces real translated pages with editable text instead of a disabled Translate button.
