# Upload-first photo translate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the design-editor-shaped demo with an upload-first photo editor: a pre-editor upload screen, a Photo Editor UI whose dock contains only Translate and Uploads, a hard-coded three-model allow-list for the Translate panel, and a Back button that returns to upload.

**Architecture:** `src/index.ts` becomes a small state machine (onboarding / upload / editor) that swaps DOM into `#cesdk_container`. A new `photo-editor/` config plugin (mirroring `starterkit-photo-editor-ts-web`) replaces `design-editor/`. The Translate panel's dynamic gateway catalog is replaced with a `TRANSLATE_MODELS` constant. After `cesdk.createFromImage`, the first image block is selected and the Translate panel opens.

**Tech Stack:** TypeScript, Vite, CE.SDK 1.75.x (`@cesdk/cesdk-js`), `@cesdk/cesdk-js/plugins` asset sources, the IMG.LY AI Gateway. No automated tests (per user instruction); verification is `tsc --noEmit` after each task and a manual smoke check at the end.

**Per-task verification:** every task ends with `npm run check:syntax` (= `tsc --noEmit`) followed by a commit. The project must build cleanly at every step.

**Reference spec:** [docs/superpowers/specs/2026-05-28-upload-first-photo-translate-design.md](../specs/2026-05-28-upload-first-photo-translate-design.md). The photo editor scaffold is copied from `/Users/wojtek/Development/img.ly/starterkit-photo-editor-ts-web`.

---

## Task 1: Scaffold `photo-editor/` from the photo starter kit

**Files:**
- Copy from: `/Users/wojtek/Development/img.ly/starterkit-photo-editor-ts-web/photo-editor/`
- Create: `photo-editor/` (entire folder, contents verbatim)

This task is additive — nothing imports `photo-editor/` yet, so the build is unaffected. Subsequent tasks edit individual files inside this folder.

- [ ] **Step 1: Copy the folder verbatim**

```bash
cp -R /Users/wojtek/Development/img.ly/starterkit-photo-editor-ts-web/photo-editor \
      /Users/wojtek/Development/playground/translate-demo/photo-editor
```

- [ ] **Step 2: Verify the file list matches expectations**

Run:
```bash
ls photo-editor photo-editor/ui
```

Expected output:
```
photo-editor:
actions.ts  features.ts  i18n.ts  plugin.ts  settings.ts  ui

photo-editor/ui:
canvas.ts  components.ts  dock.ts  index.ts  inspectorBar.ts  navigationBar.ts  panel.ts
```

- [ ] **Step 3: Type-check**

Run: `npm run check:syntax`
Expected: exits 0 (the new files compile against the same `@cesdk/cesdk-js` we already have).

- [ ] **Step 4: Commit**

```bash
git add photo-editor/
git commit -m "Scaffold photo-editor/ from starterkit-photo-editor-ts-web"
```

---

## Task 2: Wire `onBack` into `PhotoEditorConfig`

**Files:**
- Modify: `photo-editor/plugin.ts`

The plugin gains a constructor that accepts `{ onBack }`. It stores the option and passes it through to `setupUI` so the navigation bar's Back button (added in Task 4) can wire its click handler.

- [ ] **Step 1: Replace `photo-editor/plugin.ts` with the version below**

```typescript
/**
 * Photo Editor Plugin - Complete Photo Editing Configuration for CE.SDK
 *
 * This plugin provides a production-ready photo editor configuration optimized
 * for single-image editing with crop, adjustments, filters, and effects.
 *
 * @example Basic usage
 * ```typescript
 * import CreativeEditorSDK from '@cesdk/cesdk-js';
 * import { PhotoEditorConfig } from './plugin';
 *
 * const cesdk = await CreativeEditorSDK.create('#editor', config);
 * await cesdk.addPlugin(new PhotoEditorConfig({ onBack: () => {} }));
 * ```
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/disable-or-enable-f058e2/
 * @see https://img.ly/docs/cesdk/js/configuration-2c1c3d/
 */

import type { EditorPlugin, EditorPluginContext } from '@cesdk/cesdk-js';
import CreativeEditorSDK from '@cesdk/cesdk-js';

import { setupActions } from './actions';
import { setupFeatures } from './features';
import { setupTranslations } from './i18n';
import { setupSettings } from './settings';
import { setupUI } from './ui';

export interface PhotoEditorConfigOpts {
  /** Handler for the navigation-bar Back button. */
  onBack: () => void;
}

/**
 * Photo Editor configuration plugin.
 *
 * @public
 */
export class PhotoEditorConfig implements EditorPlugin {
  name = 'cesdk-photo-editor';
  version = CreativeEditorSDK.version;

  private opts: PhotoEditorConfigOpts;

  constructor(opts: PhotoEditorConfigOpts) {
    this.opts = opts;
  }

  async initialize(ctx: EditorPluginContext) {
    const subscriptions: (() => void)[] = [];
    const { cesdk, engine } = ctx;
    if (cesdk) {
      cesdk.resetEditor();
      setupFeatures(cesdk);
      setupUI(cesdk, this.opts);
      setupActions(cesdk);
      setupTranslations(cesdk);
      setupOnReset(cesdk, subscriptions);
      setupSettings(engine);
      // eslint-disable-next-line -- Intentional backward-compat shim.
      cesdk.reapplyLegacyUserConfiguration();
    }
  }
}

function setupOnReset(
  cesdk: CreativeEditorSDK,
  subscriptions: (() => void)[]
): void {
  cesdk.onReset(() => {
    subscriptions.forEach((unsubscribe) => unsubscribe());
    subscriptions.length = 0;
  });
}
```

- [ ] **Step 2: Update `photo-editor/ui/index.ts` to take and forward the opts**

Replace its contents with:

```typescript
/**
 * UI Configuration - Orchestrates All UI Setup
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/overview-41101a/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import type { PhotoEditorConfigOpts } from '../plugin';
import { setupCanvas } from './canvas';
import { setupComponents } from './components';
import { setupDock } from './dock';
import { setupInspectorBar } from './inspectorBar';
import { setupNavigationBar } from './navigationBar';
import { setupPanels } from './panel';

export function setupUI(
  cesdk: CreativeEditorSDK,
  opts: PhotoEditorConfigOpts
): void {
  setupPanels(cesdk);
  setupComponents(cesdk);
  setupNavigationBar(cesdk, opts);
  setupCanvas(cesdk);
  setupInspectorBar(cesdk);
  setupDock(cesdk);
}

export {
  setupCanvas,
  setupComponents,
  setupDock,
  setupInspectorBar,
  setupNavigationBar,
  setupPanels
};
```

`setupNavigationBar` gains its second parameter in Task 4; until then it ignores `opts`. To keep the build green meanwhile, also update the signature in `photo-editor/ui/navigationBar.ts`:

```typescript
export function setupNavigationBar(
  cesdk: CreativeEditorSDK,
  _opts: { onBack: () => void }
): void {
  // existing body — uses _opts in Task 4
  cesdk.ui.setComponentOrder({ in: 'ly.img.navigation.bar' }, [
    'ly.img.documentSettings.navigationBar',
    'ly.img.undoRedo.navigationBar',
    'ly.img.spacer',
    'ly.img.title.navigationBar',
    'ly.img.spacer',
    'ly.img.zoom.navigationBar',
    'ly.img.preview.navigationBar'
  ]);
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add photo-editor/
git commit -m "Pass onBack through PhotoEditorConfig to the UI layer"
```

---

## Task 3: Trim the photo editor's dock to Translate + Uploads

**Files:**
- Modify: `photo-editor/ui/dock.ts`

The starter's dock has Crop / Adjust / Filter / Effects on the left and Text / Shapes / Stickers on the right. Replace the whole order with two entries: Translate (custom) first, Uploads second.

- [ ] **Step 1: Replace `photo-editor/ui/dock.ts` with the version below**

```typescript
/**
 * Dock Configuration — Translate + Uploads only.
 *
 * The Translate entry is registered by the Translate plugin
 * (TRANSLATE_DOCK_ID); we just place it. Uploads uses CE.SDK's
 * built-in asset-library dock component, pointed at the
 * `ly.img.image.upload` source.
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/dock-cb916c/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { TRANSLATE_DOCK_ID } from '../../src/imgly/plugins/translate';

export function setupDock(cesdk: CreativeEditorSDK): void {
  const { engine, ui } = cesdk;

  engine.editor.setSetting('dock/hideLabels', false);
  engine.editor.setSetting('dock/iconSize', 'large');

  ui.setComponentOrder({ in: 'ly.img.dock' }, [
    TRANSLATE_DOCK_ID,
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.upload',
      icon: '@imgly/Upload',
      label: 'libraries.ly.img.upload.label',
      entries: ['ly.img.image.upload']
    }
  ]);
}
```

The relative import `../../src/imgly/plugins/translate` works because the photo starter's `photo-editor/` folder lives next to `src/` (we kept the same structure).

- [ ] **Step 2: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add photo-editor/ui/dock.ts
git commit -m "Trim photo editor dock to Translate + Uploads"
```

---

## Task 4: Add Back button to the navigation bar

**Files:**
- Modify: `photo-editor/ui/navigationBar.ts`

Add `'ly.img.back.navigationBar'` (a pre-built CE.SDK component) at `position: 'start'`, wired to `opts.onBack`. Enable the `'ly.img.navigation.back'` feature is already on in the starter kit's `features.ts`, so the button will render.

- [ ] **Step 1: Replace the body of `setupNavigationBar` in `photo-editor/ui/navigationBar.ts`**

The header comments are fine; only the function body changes. The full file should look like:

```typescript
/**
 * Navigation Bar Configuration - Top Bar with Actions and Controls
 *
 * (header comments unchanged — see the original file for the full list of
 * available components)
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/navigation-bar-4e5d39/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

export interface SetupNavigationBarOpts {
  /** Called when the user clicks the Back button. */
  onBack: () => void;
}

/**
 * Configure the navigation bar layout and behavior.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 * @param opts.onBack - Click handler for the leftmost Back button.
 */
export function setupNavigationBar(
  cesdk: CreativeEditorSDK,
  opts: SetupNavigationBarOpts
): void {
  cesdk.ui.setComponentOrder({ in: 'ly.img.navigation.bar' }, [
    {
      id: 'ly.img.back.navigationBar',
      onClick: () => opts.onBack()
    },
    'ly.img.documentSettings.navigationBar',
    'ly.img.undoRedo.navigationBar',
    'ly.img.spacer',
    'ly.img.title.navigationBar',
    'ly.img.spacer',
    'ly.img.zoom.navigationBar',
    'ly.img.preview.navigationBar'
  ]);
}
```

Don't bother preserving the long header comment listing every available component — the starter kit's contents are stored in git history if anyone needs them. (If you'd rather keep it, leave the doc block intact and only swap the function.)

- [ ] **Step 2: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add photo-editor/ui/navigationBar.ts
git commit -m "Add Back button at the start of the navigation bar"
```

---

## Task 5: Build the upload screen

**Files:**
- Create: `src/imgly/plugins/upload/upload.ts`
- Create: `src/imgly/plugins/upload/upload.css`
- Create: `src/imgly/plugins/upload/index.ts`

Vanilla TS, sibling of `src/imgly/plugins/translate/onboarding.ts`. Drop+click+preview, disabled Continue until a file is picked.

- [ ] **Step 1: Create `src/imgly/plugins/upload/upload.ts`**

```typescript
/**
 * Pre-editor upload screen.
 *
 * Shown after the API key is verified and before the CE.SDK editor mounts.
 * The user drops or picks an image; clicking "Continue to editor" invokes
 * `opts.onContinue(file)`. The screen styles itself to its container, so
 * passing `#cesdk_container` is fine.
 */

import './upload.css';

export interface RenderUploadScreenOpts {
  onContinue: (file: File) => void;
}

export function renderUploadScreen(
  root: HTMLElement,
  opts: RenderUploadScreenOpts
): void {
  root.innerHTML = '';

  const container = el('div', 'tr-up-container');
  const card = el('div', 'tr-up-card');
  container.appendChild(card);
  root.appendChild(container);

  card.appendChild(badge('Step 1 of 2'));
  card.appendChild(title('Pick an image to translate'));

  const lead = el('p', 'tr-up-lead');
  lead.textContent =
    'Upload a photo that contains text. The editor will open with it ' +
    'loaded and the Translate panel ready.';
  card.appendChild(lead);

  // File picker (hidden; triggered by clicks on the drop zone).
  const fileInput = el('input') as HTMLInputElement;
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  card.appendChild(fileInput);

  // Drop zone container — toggles between idle and preview state in place.
  const dropZone = el('button', 'tr-up-dropzone') as HTMLButtonElement;
  dropZone.type = 'button';
  card.appendChild(dropZone);

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

  // ---- State -------------------------------------------------------------

  let selectedFile: File | null = null;
  let previewURL: string | null = null;

  function setSelected(file: File): void {
    if (previewURL) URL.revokeObjectURL(previewURL);
    selectedFile = file;
    previewURL = URL.createObjectURL(file);
    errorMessage.hidden = true;
    renderPreview();
    continueBtn.disabled = false;
  }

  function clearSelected(): void {
    if (previewURL) URL.revokeObjectURL(previewURL);
    selectedFile = null;
    previewURL = null;
    renderIdle();
    continueBtn.disabled = true;
  }

  function showError(message: string): void {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }

  // ---- Drop zone renderers ----------------------------------------------

  function renderIdle(): void {
    dropZone.innerHTML = '';
    dropZone.classList.remove('tr-up-dropzone--has-preview');
    const icon = el('span', 'tr-up-dropzone-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⬆';
    const text = el('span', 'tr-up-dropzone-text');
    text.textContent = 'Drop image or click to browse';
    dropZone.appendChild(icon);
    dropZone.appendChild(text);
  }

  function renderPreview(): void {
    if (!selectedFile || !previewURL) return;
    dropZone.innerHTML = '';
    dropZone.classList.add('tr-up-dropzone--has-preview');
    const img = el('img', 'tr-up-preview') as HTMLImageElement;
    img.src = previewURL;
    img.alt = selectedFile.name;
    const meta = el('div', 'tr-up-preview-meta');
    const name = el('span', 'tr-up-preview-name');
    name.textContent = selectedFile.name;
    const change = el('span', 'tr-up-preview-change');
    change.textContent = 'Change';
    meta.appendChild(name);
    meta.appendChild(change);
    dropZone.appendChild(img);
    dropZone.appendChild(meta);
  }

  // ---- Wiring ------------------------------------------------------------

  function pickFile(file: File | null | undefined): void {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Pick an image file (PNG, JPG, …).');
      return;
    }
    setSelected(file);
  }

  dropZone.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    pickFile(fileInput.files?.[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('tr-up-dropzone--hover');
  });
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('tr-up-dropzone--hover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('tr-up-dropzone--hover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('tr-up-dropzone--hover');
    pickFile(e.dataTransfer?.files?.[0]);
  });

  continueBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    // Don't revoke previewURL here — the editor still needs to read the
    // bytes; renderUploadScreen revokes on the next clearSelected call,
    // or the next renderUploadScreen call clears it via root.innerHTML.
    opts.onContinue(selectedFile);
  });

  // Initial state.
  renderIdle();
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function badge(content: string): HTMLElement {
  const span = el('span', 'tr-up-badge');
  span.textContent = content;
  return span;
}

function title(content: string): HTMLElement {
  const div = el('div', 'tr-up-title');
  div.setAttribute('role', 'heading');
  div.setAttribute('aria-level', '2');
  div.textContent = content;
  return div;
}
```

- [ ] **Step 2: Create `src/imgly/plugins/upload/upload.css`**

Tokens chosen to match `onboarding.css` (compare against `src/imgly/plugins/translate/onboarding.css` if you want pixel parity).

```css
.tr-up-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: #f7f7fa;
  color: #1a1a1a;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
}

.tr-up-card {
  max-width: 520px;
  width: 100%;
  padding: 32px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 12px 32px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tr-up-badge {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef0f5;
  color: #4a4a55;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.tr-up-title {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}

.tr-up-lead {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: #4a4a55;
}

.tr-up-dropzone {
  appearance: none;
  border: 2px dashed #c2c5cf;
  border-radius: 12px;
  background: #fafbfd;
  padding: 24px;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  color: #4a4a55;
  font: inherit;
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.tr-up-dropzone:hover,
.tr-up-dropzone:focus-visible {
  border-color: #5a5fff;
  background: #f3f4ff;
  outline: none;
}

.tr-up-dropzone--hover {
  border-color: #5a5fff;
  background: #ecedff;
}

.tr-up-dropzone--has-preview {
  padding: 16px;
  gap: 12px;
}

.tr-up-dropzone-icon {
  font-size: 28px;
  line-height: 1;
}

.tr-up-dropzone-text {
  font-size: 14px;
}

.tr-up-preview {
  max-width: 240px;
  max-height: 240px;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  background: #ffffff;
}

.tr-up-preview-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #4a4a55;
}

.tr-up-preview-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tr-up-preview-change {
  color: #5a5fff;
  text-decoration: underline;
}

.tr-up-error {
  margin: 0;
  font-size: 13px;
  color: #c4262e;
}

.tr-up-button {
  appearance: none;
  border: none;
  border-radius: 8px;
  padding: 12px 18px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  align-self: flex-end;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.tr-up-button--primary {
  background: #5a5fff;
  color: #ffffff;
}

.tr-up-button--primary:hover:not(:disabled) {
  background: #4347e0;
}

.tr-up-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Create `src/imgly/plugins/upload/index.ts`**

```typescript
/**
 * Upload-screen plugin entry point.
 */

export {
  renderUploadScreen,
  type RenderUploadScreenOpts
} from './upload';
```

- [ ] **Step 4: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/imgly/plugins/upload/
git commit -m "Add upload screen (drop+click+preview)"
```

---

## Task 6: Replace dynamic catalog with `TRANSLATE_MODELS` allow-list

**Files:**
- Modify: `src/imgly/plugins/translate/providers.ts`
- Modify: `src/imgly/plugins/translate/panel.ts`

`providers.ts` adds the `TRANSLATE_MODELS` constant; it keeps the old `CURATED_IMAGE_EDIT_MODEL_IDS` and `instantiateGatewayProviders` exports for now so `src/imgly/index.ts` still builds. Those are removed in Task 8.

`panel.ts` drops the entire dynamic-catalog state machine and uses `TRANSLATE_MODELS` directly.

- [ ] **Step 1: Update `src/imgly/plugins/translate/providers.ts`**

Replace its contents with:

```typescript
/**
 * Translate feature — provider + language constants.
 *
 * The Translate panel offers a fixed allow-list of three image-edit models
 * (Nano Banana Pro, GPT Image 2, Seedream 4.5). No live catalog fetch.
 */

import { GatewayProvider as ImageGatewayProvider } from '@imgly/plugin-ai-image-generation-web/gateway';

export const DEFAULT_GATEWAY_URL = 'https://gateway.img.ly';

export interface TargetLanguage {
  id: string;
  label: string;
  promptName: string;
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { id: 'de', label: 'German', promptName: 'German' },
  { id: 'en', label: 'English', promptName: 'English' },
  { id: 'es', label: 'Spanish', promptName: 'Spanish' },
  { id: 'ru', label: 'Russian', promptName: 'Russian' },
  { id: 'zh', label: 'Chinese (Simplified)', promptName: 'Simplified Chinese' }
];

export interface TranslateModel {
  /** Gateway model id (passed to `client.generate`). */
  id: string;
  /** Label shown in the dropdown. */
  label: string;
}

/**
 * Fixed allow-list of image-edit models offered by the Translate panel.
 * The order here is the dropdown order; the first entry is the default
 * selection.
 */
export const TRANSLATE_MODELS: readonly TranslateModel[] = [
  { id: 'google/nano-banana-pro-edit', label: 'Nano Banana Pro' },
  { id: 'openai/gpt-image-2-edit', label: 'GPT Image 2' },
  { id: 'bytedance/seedream-4.5-edit', label: 'Seedream 4.5' }
] as const;

/**
 * @deprecated Removed in Task 8. Retained temporarily so the old AI image
 * plugin wiring in `src/imgly/index.ts` keeps building until that file is
 * rewritten.
 */
export const CURATED_IMAGE_EDIT_MODEL_IDS = ['bfl/flux-2-edit'];

/**
 * @deprecated Removed in Task 8 along with the AI image plugin call.
 */
export function instantiateGatewayProviders(
  modelIds: string[],
  gatewayUrl: string
) {
  return modelIds.map((id) => ImageGatewayProvider(id, { gatewayUrl }));
}
```

- [ ] **Step 2: Replace `src/imgly/plugins/translate/panel.ts`**

Full file (drops catalog scaffolding, swaps the dropdown wiring, keeps run logic):

```typescript
/**
 * Custom Translate panel + dock entry.
 *
 * The model dropdown is the hard-coded TRANSLATE_MODELS allow-list.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { TARGET_LANGUAGES, TRANSLATE_MODELS } from './providers';
import { translateImage, TranslateError } from './translate';
import { appendTranslatedPage } from './pages';

export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
export const TRANSLATE_DOCK_ID = 'ly.img.translate.dock';
const TRANSLATE_ICON_SET_ID = 'ly.img.translate';
const TRANSLATE_ICON_ID = `@${TRANSLATE_ICON_SET_ID}/translate`;

const TRANSLATE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg">
  <symbol id="${TRANSLATE_ICON_ID}" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
  </symbol>
</svg>`;

export interface SetupTranslatePanelOpts {
  gatewayUrl: string;
  /** Empty string means "not configured" — panel surfaces a clear toast. */
  apiKey: string;
}

export function setupTranslatePanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  cesdk.ui.addIconSet(TRANSLATE_ICON_SET_ID, TRANSLATE_ICON_SVG);
  registerTranslations(cesdk);
  registerPanel(cesdk, opts);
  registerDockEntry(cesdk);
}

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

function registerPanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  cesdk.ui.registerPanel(TRANSLATE_PANEL_ID, ({ builder, engine, state }) => {
    const apiKeyConfigured = opts.apiKey.length > 0;

    const modelId = state<string>('translate.modelId', TRANSLATE_MODELS[0].id);
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

        builder.Select('translate.model', {
          inputLabel: 'panel.translate.model',
          values: dropdownValues,
          value: selectValue,
          setValue: (v: { id: string; label: string }) =>
            modelId.setValue(v.id)
        });

        for (const lang of TARGET_LANGUAGES) {
          builder.Checkbox(`translate.lang.${lang.id}`, {
            inputLabel: lang.label,
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
}

function registerDockEntry(cesdk: CreativeEditorSDK): void {
  cesdk.ui.registerComponent(TRANSLATE_DOCK_ID, ({ builder }) => {
    builder.Button(`${TRANSLATE_DOCK_ID}.button`, {
      label: 'libraries.ly.img.translate.label',
      icon: TRANSLATE_ICON_ID,
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
    { in: 'ly.img.dock', position: 'start' },
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
}

async function runTranslation(args: RunArgs): Promise<void> {
  const { cesdk, modelId, block, languages } = args;
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

  let sourceBlob: Blob;
  try {
    sourceBlob = await engine.block.export(block, { mimeType: 'image/png' });
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
          modelId
        }).then((blob) => ({ lang, blob }))
      )
    );

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
            sourceBlockId: block,
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

- [ ] **Step 3: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/imgly/plugins/translate/providers.ts src/imgly/plugins/translate/panel.ts
git commit -m "Hard-code TRANSLATE_MODELS allow-list, drop dynamic catalog"
```

---

## Task 7: Delete `translate/catalog.ts`

**Files:**
- Delete: `src/imgly/plugins/translate/catalog.ts`

`panel.ts` no longer imports it. `index.ts` doesn't either.

- [ ] **Step 1: Verify nothing imports `catalog.ts`**

Run:
```bash
grep -rn "from './catalog'\|from '\\./catalog\\.ts'\|from '\\.\\./catalog'" src/
```

Expected: no output.

- [ ] **Step 2: Delete the file**

```bash
rm src/imgly/plugins/translate/catalog.ts
```

- [ ] **Step 3: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A src/imgly/plugins/translate/catalog.ts
git commit -m "Delete unused translate catalog module"
```

---

## Task 8: Rewrite `src/imgly/index.ts` as `initPhotoEditor`

**Files:**
- Modify: `src/imgly/index.ts`
- Modify: `src/imgly/plugins/translate/providers.ts` (removes the deprecated exports)

Replace the design-editor wiring with the photo-editor one (baselined on the photo starter kit's file). Drop the AI image plugin call, the asset-source plugins that don't apply, the scene `loadFromURL`, and the design-editor's navigation-bar actions. Add `UploadAssetSources({ include: ['ly.img.image.upload'] })` so the Uploads dock entry has a source. Pass `onBack` through.

- [ ] **Step 1: Replace `src/imgly/index.ts` with the version below**

```typescript
/**
 * CE.SDK Photo Editor — Initialization Module
 *
 * Wires PhotoEditorConfig + asset sources + background removal + the custom
 * Translate plugin. The caller (src/index.ts) is responsible for creating
 * the CE.SDK instance and loading a scene (via `cesdk.createFromImage`).
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  BlurAssetSource,
  ImageColorsAssetSource,
  ColorPaletteAssetSource,
  CropPresetsAssetSource,
  EffectsAssetSource,
  FiltersAssetSource,
  PagePresetsAssetSource,
  StickerAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  UploadAssetSources,
  VectorShapeAssetSource
} from '@cesdk/cesdk-js/plugins';

import { PhotoEditorConfig } from '../../photo-editor/plugin';
import { setupBackgroundRemovalPlugin } from './plugins/background-removal';
import { setupTranslatePlugin } from './plugins/translate';
import { DEFAULT_GATEWAY_URL } from './plugins/translate/providers';

export { PhotoEditorConfig } from '../../photo-editor/plugin';
export { setupBackgroundRemovalPlugin } from './plugins/background-removal';

export interface InitPhotoEditorOpts {
  /** Click handler for the navigation-bar Back button. */
  onBack: () => void;
}

/**
 * Initialize the CE.SDK Photo Editor with this demo's configuration.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 * @param opts.onBack - Back-button handler (returns to the upload screen)
 */
export async function initPhotoEditor(
  cesdk: CreativeEditorSDK,
  opts: InitPhotoEditorOpts
): Promise<void> {
  // Configuration plugin (dock, navigation bar, features, etc.).
  await cesdk.addPlugin(new PhotoEditorConfig({ onBack: opts.onBack }));

  // Background removal (works on the loaded photo).
  setupBackgroundRemovalPlugin(cesdk);

  // Translate plugin (dock entry + panel + AI gateway credentials).
  const apiKey = import.meta.env.VITE_AI_API_KEY ?? '';
  const gatewayUrl =
    import.meta.env.VITE_AI_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
  setupTranslatePlugin(cesdk, { apiKey, gatewayUrl });

  // Asset source plugins — same set as the photo starter kit, plus the
  // image-upload source the Uploads dock entry points at.
  await cesdk.addPlugin(new BlurAssetSource());
  await cesdk.addPlugin(new ImageColorsAssetSource());
  await cesdk.addPlugin(new ColorPaletteAssetSource());
  await cesdk.addPlugin(new CropPresetsAssetSource());
  await cesdk.addPlugin(new EffectsAssetSource());
  await cesdk.addPlugin(new FiltersAssetSource());
  await cesdk.addPlugin(new PagePresetsAssetSource());
  await cesdk.addPlugin(new StickerAssetSource());
  await cesdk.addPlugin(new TextAssetSource());
  await cesdk.addPlugin(new TextComponentAssetSource());
  await cesdk.addPlugin(new TypefaceAssetSource());
  await cesdk.addPlugin(new VectorShapeAssetSource());
  await cesdk.addPlugin(
    new UploadAssetSources({ include: ['ly.img.image.upload'] })
  );
}
```

- [ ] **Step 2: Remove the deprecated exports from `providers.ts`**

In `src/imgly/plugins/translate/providers.ts`, delete:

```typescript
/**
 * @deprecated Removed in Task 8. Retained temporarily so the old AI image
 * plugin wiring in `src/imgly/index.ts` keeps building until that file is
 * rewritten.
 */
export const CURATED_IMAGE_EDIT_MODEL_IDS = ['bfl/flux-2-edit'];

/**
 * @deprecated Removed in Task 8 along with the AI image plugin call.
 */
export function instantiateGatewayProviders(
  modelIds: string[],
  gatewayUrl: string
) {
  return modelIds.map((id) => ImageGatewayProvider(id, { gatewayUrl }));
}
```

Also remove the now-unused import at the top of the file:

```typescript
import { GatewayProvider as ImageGatewayProvider } from '@imgly/plugin-ai-image-generation-web/gateway';
```

- [ ] **Step 3: Also drop the now-unused `installTranslateCredentials` export usage**

If `src/imgly/plugins/translate/index.ts` still re-exports `installTranslateCredentials`, the export can stay (other code may consume it later), but it isn't used by the new `initPhotoEditor`. No edit needed unless eslint complains about the unused import — there isn't one to remove.

- [ ] **Step 4: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/imgly/index.ts src/imgly/plugins/translate/providers.ts
git commit -m "Rewire initPhotoEditor: PhotoEditorConfig, no AI image plugin, no scene load"
```

---

## Task 9: Rewrite `src/index.ts` with the state machine

**Files:**
- Modify: `src/index.ts`

Three-screen state machine; `mountEditor` does selection + panel-open after `createFromImage`; `navigateBackToUpload` disposes the CE.SDK instance and re-renders the upload screen.

- [ ] **Step 1: Replace `src/index.ts` with the version below**

```typescript
/**
 * CE.SDK Photo Translate Demo — Main Entry Point
 *
 * State machine:
 *   no API key  → onboarding screen
 *   API key set → upload screen → editor (with the uploaded image loaded,
 *                                          selected, Translate panel open)
 *
 * Reload re-enters the state machine from the top; the upload screen is the
 * editor's entry point, and there is no persistence.
 */

import CreativeEditorSDK from '@cesdk/cesdk-js';

import { initPhotoEditor } from './imgly';
import {
  getApiKey,
  renderOnboardingScreen,
  setConfiguredApiKey,
  TRANSLATE_PANEL_ID
} from './imgly/plugins/translate';
import { renderUploadScreen } from './imgly/plugins/upload';

setConfiguredApiKey(import.meta.env.VITE_AI_API_KEY ?? '');

const container = document.querySelector<HTMLDivElement>('#cesdk_container');
if (!container) {
  // eslint-disable-next-line no-console
  console.error('No #cesdk_container element found.');
} else {
  showCurrentScreen(container);
}

function showCurrentScreen(root: HTMLDivElement): void {
  if (!getApiKey()) {
    renderOnboardingScreen(root, { reason: 'missing' });
    return;
  }
  renderUploadScreen(root, {
    onContinue: (file) => {
      const objectURL = URL.createObjectURL(file);
      void mountEditor(root, objectURL);
    }
  });
}

async function mountEditor(
  root: HTMLDivElement,
  objectURL: string
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
    URL.revokeObjectURL(objectURL);
    renderOnboardingScreen(root, { reason: 'invalid' });
    return;
  }

  (window as unknown as { cesdk: CreativeEditorSDK }).cesdk = cesdk;

  await initPhotoEditor(cesdk, {
    onBack: () => navigateBackToUpload(root, cesdk)
  });

  try {
    await cesdk.createFromImage(objectURL);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load image into editor:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not load image — try a different file.',
      duration: 'medium'
    });
    URL.revokeObjectURL(objectURL);
    navigateBackToUpload(root, cesdk);
    return;
  }
  URL.revokeObjectURL(objectURL);

  const imageBlock = findFirstImageBlock(cesdk.engine);
  if (imageBlock != null) cesdk.engine.block.select(imageBlock);
  cesdk.ui.openPanel(TRANSLATE_PANEL_ID);
}

function navigateBackToUpload(
  root: HTMLDivElement,
  cesdk: CreativeEditorSDK
): void {
  cesdk.dispose();
  delete (window as unknown as { cesdk?: unknown }).cesdk;
  showCurrentScreen(root);
}

function findFirstImageBlock(
  engine: CreativeEditorSDK['engine']
): number | null {
  const pages = engine.scene.getPages();
  for (const page of pages) {
    for (const child of engine.block.getChildren(page)) {
      if (!engine.block.supportsFill(child)) continue;
      const fill = engine.block.getFill(child);
      if (engine.block.getType(fill) === '//ly.img.ubq/fill/image') {
        return child;
      }
    }
  }
  return null;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "Wire upload → editor state machine with auto-select and panel open"
```

---

## Task 10: Delete `design-editor/`

**Files:**
- Delete: `design-editor/` (entire folder)

Nothing imports from it now (`src/imgly/index.ts` references `photo-editor/plugin` instead).

- [ ] **Step 1: Verify nothing in `src/` imports from `design-editor`**

Run:
```bash
grep -rn "design-editor" src/
```

Expected: no output.

- [ ] **Step 2: Delete the folder**

```bash
rm -rf design-editor/
```

- [ ] **Step 3: Type-check**

Run: `npm run check:syntax`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A design-editor/
git commit -m "Remove design-editor config (superseded by photo-editor)"
```

---

## Task 11: Update README

**Files:**
- Modify: `README.md`

Rewrite the project's title section + the Translate section to describe the upload-first flow. Remove the smoke checklist (no automated tests, and the manual flow is now self-evident).

- [ ] **Step 1: Replace the project title block (lines 1–9) with**

```markdown
# Photo Translate Demo

Translate the text inside a photograph using IMG.LY's CE.SDK + the IMG.LY
AI Gateway. Upload an image, click Continue, pick languages, get one new
page per translation — all in the browser.

<p>
  <a href="https://img.ly/docs/cesdk/js/starterkits/photo-editor-fp8h8a/">Photo Editor docs</a>
</p>

![Photo Translate Demo](./hero.webp)
```

- [ ] **Step 2: Replace the existing "Translate (AI Image Translation)" section (≈ lines 133–181) with**

```markdown
## How translation works

The demo opens to a small upload screen (the editor is *not* the entry
point). Drop a photo that contains text, click **Continue to editor**, and
the photo opens in a Photo Editor UI with the Translate panel pre-opened
and the image pre-selected.

The dock contains exactly two entries: **Translate** and **Uploads**.

### Models

The Translate panel offers three image-edit models routed through the
IMG.LY AI Gateway:

| Model           | Gateway id                       |
|-----------------|----------------------------------|
| Nano Banana Pro | `google/nano-banana-pro-edit`    |
| GPT Image 2     | `openai/gpt-image-2-edit`        |
| Seedream 4.5    | `bytedance/seedream-4.5-edit`    |

The list is hard-coded in `src/imgly/plugins/translate/providers.ts`. To
change it, edit `TRANSLATE_MODELS`.

### Configuration

1. Copy `.env.example` to `.env` and set `VITE_AI_API_KEY` to a key from the
   [IMG.LY dashboard](https://img.ly/dashboard). (Optional:
   `VITE_AI_GATEWAY_URL` to point at a non-production gateway.)
2. Restart the dev server.

If `VITE_AI_API_KEY` is unset, the app shows an onboarding screen instead
of the upload screen.

The starter forwards the key to the gateway via `{ dangerouslyExposeApiKey }`
— exposed to anyone with DevTools access. **This is intentional for local
development only.** In production, return a short-lived JWT minted by your
backend from the `ly.img.ai.getToken` action handler instead.

### Using it

1. Drop or pick a photo with text on the upload screen.
2. Click **Continue to editor**. The photo opens with the Translate panel
   already open and the image already selected.
3. Pick a model (default: Nano Banana Pro). Check one or more target
   languages (German, English, Spanish, Russian, Chinese).
4. Click **Translate**. One new page per checked language is appended,
   each containing the photo with its text translated. The whole batch is
   one undo step.

Use the **Back** button in the top-left of the navigation bar to return to
the upload screen. Edits to the current scene are discarded — like a page
reload.
```

- [ ] **Step 3: Verify the rest of the README is still consistent**

Skim the file. Sections to keep: Getting Started, Configuration (the
existing one, about loading content with `actions.run('scene.create')`),
Theming, Localization, Architecture, Key Capabilities, Prerequisites,
Troubleshooting, Documentation, License. The Architecture diagram should
be updated to reflect `photo-editor/` replacing `design-editor/`:

```
photo-translate-demo/
├── src/
│   ├── index.ts                          # State machine + editor bootstrap
│   └── imgly/
│       ├── index.ts                      # initPhotoEditor
│       ├── plugins/
│       │   ├── background-removal.ts
│       │   ├── translate/                # Translate dock entry + panel
│       │   └── upload/                   # Pre-editor upload screen
│       └── …
├── photo-editor/                          # Photo Editor config (dock, nav, etc.)
├── public/
├── package.json
└── vite.config.ts
```

Update that block if a similar one exists in the README.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Rewrite README for the upload-first photo translate flow"
```

---

## Task 12: Manual smoke check

No automated tests (per user instruction). Run through the flow once to confirm everything works end-to-end.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the upload screen**

Open `http://localhost:5173`. Expected:

- Upload card centered, "Step 1 of 2" badge, "Pick an image to translate" title.
- Drop zone shows "Drop image or click to browse".
- Continue button visible and disabled.

- [ ] **Step 3: Verify file selection**

Click the drop zone, pick a PNG/JPG with some text on it. Expected:

- Drop zone replaces itself with a thumbnail + filename + "Change" link.
- Continue button enables.

Click "Change", pick a different file. Expected: thumbnail updates.

- [ ] **Step 4: Verify non-image rejection**

Pick a `.txt` file via the picker (or drop a `.pdf` on the drop zone). Expected: inline error "Pick an image file (PNG, JPG, …)." appears under the drop zone; Continue remains disabled.

- [ ] **Step 5: Verify editor mount + auto-select + auto-open panel**

Pick an image, click Continue. Expected:

- Editor mounts, the chosen photo is on the canvas filling the page.
- Dock on the left shows only **Translate** (top) and **Uploads** (below). Nothing else.
- Translate panel is open on the right.
- Model dropdown shows three entries: Nano Banana Pro, GPT Image 2, Seedream 4.5. Nano Banana Pro is selected.
- No languages checked; Translate button disabled with the "Choose at least one target language" hint.
- Image block visibly selected (selection outline).

- [ ] **Step 6: Verify translation**

Check German + Spanish, click Translate. Expected:

- Translate button shows a loading spinner; button is disabled.
- After the gateway responds, two new pages are appended ("German", "Spanish"), each containing the translated image at the same position/size.
- A success toast confirms "2 translated pages added.".
- `Cmd/Ctrl+Z` undoes the whole batch in one step.

- [ ] **Step 7: Verify Back button**

Click the Back button in the top-left of the navigation bar. Expected: the editor is replaced by the upload screen; uploaded image is forgotten (drop zone is back to idle).

- [ ] **Step 8: Verify reload behavior**

Reload the page. Expected: upload screen, idle. The previous image is not restored.

- [ ] **Step 9: Verify the onboarding-screen fallback**

Stop the dev server. Edit `.env` to comment out `VITE_AI_API_KEY`. Restart. Expected: onboarding screen appears (not the upload screen). Restore the key, restart, confirm the upload screen returns.

- [ ] **Step 10: If all of the above pass, no commit needed**

The implementation is complete. Stop the dev server and consider the plan done.

---

## Self-review notes

A few cross-task consistency points to verify before handing off:

- **`TRANSLATE_DOCK_ID` import path** — `photo-editor/ui/dock.ts` imports it from `../../src/imgly/plugins/translate`. That export already exists at `src/imgly/plugins/translate/index.ts:38` (the line `export { TRANSLATE_PANEL_ID, TRANSLATE_DOCK_ID } from './panel';`) — verified at plan-writing time.
- **`renderUploadScreen` re-render** — the function clears `root.innerHTML` on entry, so `navigateBackToUpload → showCurrentScreen → renderUploadScreen` is safe to call repeatedly.
- **`select` order** — `cesdk.engine.block.select` is called before `cesdk.ui.openPanel(TRANSLATE_PANEL_ID)`; the panel's first render reads selection from the engine, so it skips the empty-state branch immediately.
- **Object-URL lifecycle** — created in the upload-screen callback, revoked in `mountEditor` after `createFromImage` resolves or rejects. No leaks if the user clicks Continue and then closes the tab during scene load; the browser GC's the URL handle along with the page context.
- **`UploadAssetSources` source id** — registered with `include: ['ly.img.image.upload']`; the dock entry references `entries: ['ly.img.image.upload']`. Matched, verified at plan-writing time.
- **No `tests/` directory** — per user instruction, no automated tests are written. Task 12 is a manual checklist.
