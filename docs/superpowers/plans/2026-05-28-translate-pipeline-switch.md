# Translate pipeline switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pipeline picker to the upload screen with two options — **Direct** (the current pipeline) and **IMG.LY Magic Layers** (image-to-scene; gateway model ships later). The choice flows through `mountEditor → initPhotoEditor → setupTranslatePlugin → setupTranslatePanel`. For Magic Layers, the Translate panel renders without the model selector and with a disabled Translate button + "coming soon" hint.

**Architecture:** A new `TranslatePipeline` type and `TRANSLATE_PIPELINES` constant live in `src/imgly/plugins/translate/providers.ts` alongside the other domain constants. The upload screen renders a radio group below the dropzone and propagates the chosen pipeline through the existing setup-options chain. The translate panel adds two new states keyed off `opts.pipeline`: model-selector rendering is conditional, and the Translate button is disabled with a `notImplemented` hint for Magic Layers. No changes to `translate.ts` or `pages.ts` — Magic Layers is purely a UI state for now.

**Tech Stack:** TypeScript, Vite, CE.SDK 1.75.x (`@cesdk/cesdk-js`). No automated tests (per project convention); verification is `npm run check:syntax` (= `tsc --noEmit`) after each task plus a manual smoke check at the end.

**Reference spec:** [docs/superpowers/specs/2026-05-28-translate-pipeline-switch-design.md](../specs/2026-05-28-translate-pipeline-switch-design.md).

**Per-task verification:** every task ends with `npm run check:syntax` followed by a commit. The project must build cleanly at every step.

---

## Task 1: Add the pipeline domain model

**Files:**
- Modify: `src/imgly/plugins/translate/providers.ts`
- Modify: `src/imgly/plugins/translate/index.ts`

Add the type, the spec list, and the default value. Re-export from the plugin's public entry point so callers can import from `'./imgly/plugins/translate'` like they do today for `TARGET_LANGUAGES`. This task is purely additive — no consumers change yet.

- [ ] **Step 1: Append the pipeline section to `providers.ts`**

Open `src/imgly/plugins/translate/providers.ts` and append the following after the `TRANSLATE_MODELS` block (which ends with `] as const;` near line 41):

```typescript

export type TranslatePipeline = 'direct' | 'magic-layers';

export interface TranslatePipelineSpec {
  id: TranslatePipeline;
  label: string;
  description: string;
}

/**
 * The two translation pipelines surfaced on the upload screen.
 *
 * - 'direct' is the only implemented pipeline today — one gateway request
 *   per language, returning a flat translated image (text baked in).
 * - 'magic-layers' is a placeholder for an upcoming image-to-scene model
 *   that returns scene files with editable text layers. The panel renders
 *   without a model selector and with a disabled Translate button until
 *   the gateway integration lands.
 */
export const TRANSLATE_PIPELINES: readonly TranslatePipelineSpec[] = [
  {
    id: 'direct',
    label: 'Direct',
    description: 'Flat image with higher fidelity.'
  },
  {
    id: 'magic-layers',
    label: 'IMG.LY Magic Layers',
    description:
      'Editable text, faster & cheaper for more than 2 translations. (Coming soon)'
  }
] as const;

export const DEFAULT_TRANSLATE_PIPELINE: TranslatePipeline = 'direct';
```

- [ ] **Step 2: Re-export from `index.ts`**

Open `src/imgly/plugins/translate/index.ts`. The current line 45 reads:

```typescript
export { TARGET_LANGUAGES, DEFAULT_GATEWAY_URL } from './providers';
```

Replace it with:

```typescript
export {
  TARGET_LANGUAGES,
  TRANSLATE_PIPELINES,
  DEFAULT_TRANSLATE_PIPELINE,
  DEFAULT_GATEWAY_URL
} from './providers';
export type { TranslatePipeline, TranslatePipelineSpec } from './providers';
```

- [ ] **Step 3: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/imgly/plugins/translate/providers.ts src/imgly/plugins/translate/index.ts
git commit -m "Add TranslatePipeline domain model (Direct + Magic Layers)"
```

---

## Task 2: Thread the pipeline through the setup-options chain

**Files:**
- Modify: `src/imgly/plugins/translate/panel.ts`
- Modify: `src/imgly/plugins/translate/index.ts`
- Modify: `src/imgly/index.ts`
- Modify: `src/imgly/plugins/upload/upload.ts`
- Modify: `src/index.ts`

Pipeline flows: upload screen → `src/index.ts` → `initPhotoEditor` → `setupTranslatePlugin` → `setupTranslatePanel`. This task only plumbs the parameter — no rendering change yet. The upload screen passes a hard-coded `DEFAULT_TRANSLATE_PIPELINE`; Task 3 wires the radio.

Apply all five edits before running `check:syntax` — the type chain only compiles end-to-end once every layer is updated.

- [ ] **Step 1: Accept `pipeline` in the panel setup**

Open `src/imgly/plugins/translate/panel.ts`. Find `SetupTranslatePanelOpts` (around line 24) and replace it with:

```typescript
export interface SetupTranslatePanelOpts {
  gatewayUrl: string;
  /** Empty string means "not configured" — panel surfaces a clear toast. */
  apiKey: string;
  /** Pipeline chosen on the upload screen. */
  pipeline: TranslatePipeline;
}
```

Add the type import to the existing import block near the top of the file. The current import block reads:

```typescript
import { TARGET_LANGUAGES, TRANSLATE_MODELS } from './providers';
```

Replace it with:

```typescript
import { TARGET_LANGUAGES, TRANSLATE_MODELS } from './providers';
import type { TranslatePipeline } from './providers';
```

The panel function body doesn't yet read `opts.pipeline` — Task 4 wires the conditional rendering. The type just has to be accepted now.

- [ ] **Step 2: Accept `pipeline` in the plugin setup and forward it**

Open `src/imgly/plugins/translate/index.ts`. Find `SetupTranslatePluginOpts` (around line 16) and update it to:

```typescript
export interface SetupTranslatePluginOpts {
  /** IMG.LY dashboard API key. '' means not configured. */
  apiKey: string;
  /** Gateway URL. Defaults to https://gateway.img.ly. */
  gatewayUrl?: string;
  /** Pipeline chosen on the upload screen. */
  pipeline: TranslatePipeline;
}
```

Add the type import to the existing import block near the top:

```typescript
import type { TranslatePipeline } from './providers';
```

Find the `setupTranslatePanel` call inside `setupTranslatePlugin` (around line 37):

```typescript
  setupTranslatePanel(cesdk, { gatewayUrl, apiKey: opts.apiKey });
```

Replace with:

```typescript
  setupTranslatePanel(cesdk, {
    gatewayUrl,
    apiKey: opts.apiKey,
    pipeline: opts.pipeline
  });
```

- [ ] **Step 3: Accept `pipeline` in `initPhotoEditor` and forward it**

Open `src/imgly/index.ts`. Find `InitPhotoEditorOpts` (around line 40) and update:

```typescript
export interface InitPhotoEditorOpts {
  /** Click handler for the navigation-bar Back button. */
  onBack: () => void;
  /** Pipeline chosen on the upload screen. */
  pipeline: TranslatePipeline;
}
```

Add the type import to the existing top-level imports:

```typescript
import type { TranslatePipeline } from './plugins/translate';
```

Find the `setupTranslatePlugin` call inside `initPhotoEditor` (around line 65):

```typescript
  setupTranslatePlugin(cesdk, { apiKey, gatewayUrl });
```

Replace with:

```typescript
  setupTranslatePlugin(cesdk, { apiKey, gatewayUrl, pipeline: opts.pipeline });
```

- [ ] **Step 4: Update the upload screen's callback signature**

Open `src/imgly/plugins/upload/upload.ts`. Find `RenderUploadScreenOpts` (around line 12) and update:

```typescript
export interface RenderUploadScreenOpts {
  onContinue: (file: File, pipeline: TranslatePipeline) => void;
}
```

Add the imports at the top of the file (just below the existing `import './upload.css';`):

```typescript
import { DEFAULT_TRANSLATE_PIPELINE } from '../translate';
import type { TranslatePipeline } from '../translate';
```

Find the Continue handler at the bottom of `renderUploadScreen` (around line 151):

```typescript
  continueBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    // Don't revoke previewURL here — the editor still needs to read the
    // bytes; the next renderUploadScreen call clears via root.innerHTML.
    opts.onContinue(selectedFile);
  });
```

Replace with:

```typescript
  continueBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    // Don't revoke previewURL here — the editor still needs to read the
    // bytes; the next renderUploadScreen call clears via root.innerHTML.
    // Task 3 replaces DEFAULT_TRANSLATE_PIPELINE with the radio's value.
    opts.onContinue(selectedFile, DEFAULT_TRANSLATE_PIPELINE);
  });
```

- [ ] **Step 5: Receive and forward `pipeline` in `src/index.ts`**

Open `src/index.ts`. Add the type import to the existing import from `./imgly/plugins/translate`. The current block (line 17–22) reads:

```typescript
import {
  findFirstImageBlockOnFirstPage,
  getApiKey,
  renderOnboardingScreen,
  setConfiguredApiKey,
  TRANSLATE_PANEL_ID
} from './imgly/plugins/translate';
```

Replace with:

```typescript
import {
  findFirstImageBlockOnFirstPage,
  getApiKey,
  renderOnboardingScreen,
  setConfiguredApiKey,
  TRANSLATE_PANEL_ID
} from './imgly/plugins/translate';
import type { TranslatePipeline } from './imgly/plugins/translate';
```

Find `showCurrentScreen` (around line 38) and update the `renderUploadScreen` call:

```typescript
  renderUploadScreen(root, {
    onContinue: (file, pipeline) => {
      void mountEditor(root, file, pipeline);
    }
  });
```

Find `mountEditor` (around line 50) and update its signature + the `initPhotoEditor` call. Replace the whole function header through the `initPhotoEditor(...)` call:

```typescript
async function mountEditor(
  root: HTMLDivElement,
  file: File,
  pipeline: TranslatePipeline
): Promise<void> {
  root.innerHTML = '';

  let cesdk: CreativeEditorSDK;
  try {
    cesdk = await CreativeEditorSDK.create(root, {
      userId: 'starterkit-photo-translate-user'
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize CE.SDK:', err);
    renderOnboardingScreen(root, { reason: 'invalid' });
    return;
  }

  // Debug access (remove in production).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).cesdk = cesdk;

  await initPhotoEditor(cesdk, {
    onBack: () => navigateBackToUpload(root, cesdk),
    pipeline
  });
```

(The rest of `mountEditor` is unchanged.)

- [ ] **Step 6: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/imgly/plugins/translate/panel.ts \
        src/imgly/plugins/translate/index.ts \
        src/imgly/index.ts \
        src/imgly/plugins/upload/upload.ts \
        src/index.ts
git commit -m "Thread TranslatePipeline through the setup-options chain"
```

---

## Task 3: Render the pipeline picker on the upload screen

**Files:**
- Modify: `src/imgly/plugins/upload/upload.ts`
- Modify: `src/imgly/plugins/upload/upload.css`

Replace the hard-coded `DEFAULT_TRANSLATE_PIPELINE` with a user-driven choice via a radio group below the dropzone. Visual reference (from the spec):

```
[ dropzone ]

Translation pipeline
◉ Direct
    Flat image with higher fidelity.
○ IMG.LY Magic Layers
    Editable text, faster & cheaper
    for more than 2 translations.
    (Coming soon)

                  [ Continue → ]
```

- [ ] **Step 1: Add the pipeline picker to `renderUploadScreen`**

Open `src/imgly/plugins/upload/upload.ts`. Find this block (around lines 47–61):

```typescript
  // Inline error message (only shown for non-image drops).
  const errorMessage = el('p', 'tr-up-error');
  errorMessage.hidden = true;
  card.appendChild(errorMessage);

  // Continue button.
  const continueBtn = el(
    'button',
    'tr-up-button tr-up-button--primary'
  ) as HTMLButtonElement;
  continueBtn.type = 'button';
  continueBtn.textContent = 'Continue to editor';
  continueBtn.disabled = true;
  card.appendChild(continueBtn);
```

Insert the pipeline picker between the error message and the Continue button. The new block goes immediately after `card.appendChild(errorMessage);` and before `// Continue button.`:

```typescript
  // Inline error message (only shown for non-image drops).
  const errorMessage = el('p', 'tr-up-error');
  errorMessage.hidden = true;
  card.appendChild(errorMessage);

  // Pipeline picker — radio group below the dropzone.
  const pipelineGroup = el('div', 'tr-up-pipeline') as HTMLDivElement;
  pipelineGroup.setAttribute('role', 'radiogroup');
  pipelineGroup.setAttribute('aria-label', 'Translation pipeline');
  const pipelineTitle = el('div', 'tr-up-pipeline-title');
  pipelineTitle.textContent = 'Translation pipeline';
  pipelineGroup.appendChild(pipelineTitle);

  let selectedPipeline: TranslatePipeline = DEFAULT_TRANSLATE_PIPELINE;
  const pipelineOptions: { spec: typeof TRANSLATE_PIPELINES[number]; option: HTMLLabelElement }[] = [];

  for (const spec of TRANSLATE_PIPELINES) {
    const option = el('label', 'tr-up-pipeline-option') as HTMLLabelElement;
    const radio = el('input', 'tr-up-pipeline-radio') as HTMLInputElement;
    radio.type = 'radio';
    radio.name = 'tr-up-pipeline';
    radio.value = spec.id;
    radio.checked = spec.id === selectedPipeline;
    if (radio.checked) option.classList.add('tr-up-pipeline-option--checked');
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      selectedPipeline = spec.id;
      // Toggle the highlight class on all options. (Avoids relying on the
      // CSS :has() selector, which Firefox only shipped in v121 — below
      // the README's stated Firefox 115+ floor.)
      for (const p of pipelineOptions) {
        p.option.classList.toggle(
          'tr-up-pipeline-option--checked',
          p.spec.id === selectedPipeline
        );
      }
    });

    const text = el('span', 'tr-up-pipeline-text');
    const label = el('span', 'tr-up-pipeline-label');
    label.textContent = spec.label;
    const desc = el('span', 'tr-up-pipeline-desc');
    desc.textContent = spec.description;
    text.appendChild(label);
    text.appendChild(desc);

    option.appendChild(radio);
    option.appendChild(text);
    pipelineGroup.appendChild(option);
    pipelineOptions.push({ spec, option });
  }
  card.appendChild(pipelineGroup);

  // Continue button.
  const continueBtn = el(
    'button',
    'tr-up-button tr-up-button--primary'
  ) as HTMLButtonElement;
  continueBtn.type = 'button';
  continueBtn.textContent = 'Continue to editor';
  continueBtn.disabled = true;
  card.appendChild(continueBtn);
```

Add `TRANSLATE_PIPELINES` to the existing import (the type import is already there from Task 2). The current import block reads:

```typescript
import { DEFAULT_TRANSLATE_PIPELINE } from '../translate';
import type { TranslatePipeline } from '../translate';
```

Replace with:

```typescript
import { DEFAULT_TRANSLATE_PIPELINE, TRANSLATE_PIPELINES } from '../translate';
import type { TranslatePipeline } from '../translate';
```

- [ ] **Step 2: Pass the selected pipeline to `onContinue`**

Find the Continue handler (the block edited in Task 2 Step 4) and replace it with:

```typescript
  continueBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    // Don't revoke previewURL here — the editor still needs to read the
    // bytes; the next renderUploadScreen call clears via root.innerHTML.
    opts.onContinue(selectedFile, selectedPipeline);
  });
```

- [ ] **Step 3: Add styles for the pipeline picker**

Open `src/imgly/plugins/upload/upload.css` and append at the bottom of the file:

```css

.tr-up-pipeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tr-up-pipeline-title {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  letter-spacing: 0.01em;
}

.tr-up-pipeline-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e2e4ec;
  border-radius: 10px;
  cursor: pointer;
  background: #ffffff;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.tr-up-pipeline-option:hover {
  border-color: #c2c5cf;
  background: #fafbfd;
}

.tr-up-pipeline-option--checked {
  border-color: #5a5fff;
  background: #f3f4ff;
}

.tr-up-pipeline-radio {
  margin: 3px 0 0 0;
  accent-color: #5a5fff;
  cursor: pointer;
}

.tr-up-pipeline-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.tr-up-pipeline-label {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}

.tr-up-pipeline-desc {
  font-size: 13px;
  color: #4a4a55;
}
```

- [ ] **Step 4: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 5: Visual smoke check**

```bash
npm run dev
```

Open `http://localhost:5173` and confirm:
- The "Translation pipeline" radio group is visible below the dropzone, above the Continue button.
- "Direct" is selected by default; its option has the highlighted blue border.
- Clicking "IMG.LY Magic Layers" moves the highlight to that option.
- The description text under each label matches the spec.

Stop the dev server (Ctrl-C) once verified.

- [ ] **Step 6: Commit**

```bash
git add src/imgly/plugins/upload/upload.ts src/imgly/plugins/upload/upload.css
git commit -m "Render the pipeline picker on the upload screen"
```

---

## Task 4: Make the Translate panel pipeline-aware

**Files:**
- Modify: `src/imgly/plugins/translate/panel.ts`

For `pipeline === 'magic-layers'`: skip the model selector row entirely, show the `notImplemented` hint in place of the `noLanguages` hint, and keep the Translate button disabled. For `pipeline === 'direct'`: behavior is unchanged from today.

- [ ] **Step 1: Add the new i18n key**

Open `src/imgly/plugins/translate/panel.ts`. Find `registerTranslations` (around line 42). The current `en` block reads:

```typescript
function registerTranslations(cesdk: CreativeEditorSDK): void {
  cesdk.i18n.setTranslations({
    en: {
      [`panel.${TRANSLATE_PANEL_ID}`]: 'Translate Image',
      'panel.translate.model': 'Model',
      'panel.translate.translate': 'Translate',
      'panel.translate.hint.noSelection':
        'Select an image block containing text to translate.',
      'panel.translate.hint.noLanguages':
        'Choose at least one target language.',
      'panel.translate.hint.noApiKey':
        'AI API key not configured. Set VITE_AI_API_KEY in .env.',
      'libraries.ly.img.translate.label': 'Translate'
    }
  });
}
```

Replace it with (adds the `notImplemented` key):

```typescript
function registerTranslations(cesdk: CreativeEditorSDK): void {
  cesdk.i18n.setTranslations({
    en: {
      [`panel.${TRANSLATE_PANEL_ID}`]: 'Translate Image',
      'panel.translate.model': 'Model',
      'panel.translate.translate': 'Translate',
      'panel.translate.hint.noSelection':
        'Select an image block containing text to translate.',
      'panel.translate.hint.noLanguages':
        'Choose at least one target language.',
      'panel.translate.hint.noApiKey':
        'AI API key not configured. Set VITE_AI_API_KEY in .env.',
      'panel.translate.hint.notImplemented':
        'Magic Layers translation is coming soon.',
      'libraries.ly.img.translate.label': 'Translate'
    }
  });
}
```

- [ ] **Step 2: Replace the panel children with the pipeline-aware version**

Inside `registerPanel`, find the `cesdk.ui.registerPanel(TRANSLATE_PANEL_ID, ({ builder, engine, state }) => { ... });` body (lines 63–156). Replace it with the version below.

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

        // Model selector — Direct pipeline only. Magic Layers has no
        // model choice; the gateway exposes a single image-to-scene
        // model and the panel mirrors that by skipping the row entirely.
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
            // 'right' = label on the right side of the checkbox, i.e.
            // checkbox sits on the left. CheckboxOptions extends
            // InputOptions<boolean, 'left' | 'right'>; default is 'left'.
            inputLabelPosition: 'right',
            value: !!checked.value[lang.id],
            setValue: (v: boolean) =>
              checked.setValue({ ...checked.value, [lang.id]: v })
          });
        }

        // Hint precedence: Magic Layers' notImplemented hint replaces the
        // noLanguages hint, since the button is disabled for a more
        // fundamental reason than missing language picks.
        if (isMagicLayers) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate(
              'panel.translate.hint.notImplemented'
            )
          });
        } else if (selectedLanguages.length === 0) {
          builder.Text('translate.hint', {
            content: cesdk.i18n.translate('panel.translate.hint.noLanguages')
          });
        }

        builder.Button('translate.go', {
          label: 'panel.translate.translate',
          color: 'accent',
          isLoading: isRunning.value,
          isDisabled:
            isRunning.value ||
            isMagicLayers ||
            selectedLanguages.length === 0,
          onClick: () => {
            // Defensive: the button is disabled in Magic Layers mode, but
            // guard the call site anyway so the boundary is explicit.
            if (isMagicLayers) return;
            const block = selectedImageBlock;
            if (!block) return;
            isRunning.setValue(true);
            void runTranslation({
              cesdk,
              modelId: effectiveModelId,
              block,
              languages: selectedLanguages
            }).finally(() => {
              isRunning.setValue(false);
            });
          }
        });
      }
    });
  });
```

- [ ] **Step 3: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0.

- [ ] **Step 4: Manual smoke check**

```bash
npm run dev
```

Open `http://localhost:5173` and run through both pipelines:

**Direct pipeline:**
1. Drop or pick an image.
2. Leave "Direct" selected.
3. Click "Continue to editor".
4. The Translate panel opens. Confirm:
   - The Model dropdown is visible (Nano Banana Pro by default).
   - Language checkboxes are visible.
   - With no languages checked: "Choose at least one target language." hint shows; Translate button is disabled.
   - Check one language: hint disappears; Translate button is enabled.
   - (Optional) Click Translate to confirm the existing pipeline still works.
5. Click Back to return to the upload screen.

**Magic Layers pipeline:**
1. Pick the same image.
2. Select "IMG.LY Magic Layers".
3. Click "Continue to editor".
4. The Translate panel opens. Confirm:
   - The Model dropdown is **not** visible.
   - Language checkboxes are visible.
   - "Magic Layers translation is coming soon." hint shows whether or not any languages are checked.
   - Translate button is disabled — checking languages does not enable it.
5. Click Back to return to the upload screen.

Stop the dev server (Ctrl-C) once verified.

- [ ] **Step 5: Commit**

```bash
git add src/imgly/plugins/translate/panel.ts
git commit -m "Render the Translate panel pipeline-aware (Magic Layers UI)"
```

---

## Task 5: Document the pipeline switch in the README

**Files:**
- Modify: `README.md`

Add a "Pipelines" section under "How translation works" so a new reader sees the two pipelines before the model list. Rename the existing "### Models" subsection to clarify it applies to Direct.

- [ ] **Step 1: Update the README**

Open `README.md`. Find the "### Models" subsection (around line 107). The current block reads:

```markdown
### Models

The Translate panel offers three image-edit models routed through the
IMG.LY AI Gateway:
```

Replace **just the heading line** `### Models` with the new Pipelines section followed by the renamed Models heading:

```markdown
### Pipelines

The upload screen lets the user pick between two translation pipelines:

- **Direct** — the only implemented pipeline today. Sends the source image
  and each target language to a gateway image-edit model; one gateway
  request per language; returns a flat translated image with the text
  baked into the bitmap.
- **IMG.LY Magic Layers** — image-to-scene transformation that returns
  editable scene files. Editable text, faster and cheaper for more than
  two translations. *Coming soon* — until the gateway model ships, picking
  this pipeline shows the Translate panel without the model selector and
  with a disabled Translate button.

The pipeline is fixed for the editor's lifetime. To switch, click Back to
return to the upload screen and pick the other option.

### Models (Direct pipeline)

The Translate panel offers three image-edit models routed through the
IMG.LY AI Gateway:
```

(Everything after that heading — the model table and "### Configuration" / "### Using it" sections — stays as it is.)

- [ ] **Step 2: Type-check**

```bash
npm run check:syntax
```

Expected: exits 0. (The README change shouldn't break anything; this is a sanity check that the working tree is still buildable.)

- [ ] **Step 3: Full-flow smoke test**

```bash
npm run dev
```

End-to-end:
1. Upload an image; leave "Direct" selected; Continue → confirm the existing translation flow still works (pick a language, click Translate, a new page is added).
2. Click Back → upload screen returns with "Direct" reset as the default.
3. Pick the image again; select "IMG.LY Magic Layers"; Continue → confirm Magic Layers UI (no model row, disabled Translate, "coming soon" hint).
4. Click Back → returns to upload screen.

Stop the dev server (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document Direct and Magic Layers pipelines in README"
```

---

## Done

After Task 5 commits, the branch contains:
1. A `TranslatePipeline` domain model in the translate plugin.
2. A radio picker on the upload screen, default Direct.
3. A pipeline-aware Translate panel — model selector hidden, Translate disabled, "coming soon" hint when Magic Layers is picked.
4. README documentation reflecting the new switch.

The Magic Layers gateway integration is a follow-up: a new `TRANSLATE_PIPELINES`-aware path in `translate.ts` / `pages.ts` that takes the source image + the target language list and calls the image-to-scene model. That work begins by removing the `isMagicLayers` guards in `panel.ts` and replacing them with a real `runMagicLayersTranslation` call.
