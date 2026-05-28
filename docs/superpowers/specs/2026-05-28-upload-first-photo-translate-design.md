---
title: Upload-first photo translate
date: 2026-05-28
status: approved
---

# Upload-first photo translate

## Summary

Reshape the demo around the use case it exists to demonstrate: translate text
inside a single photograph. Three changes:

1. **Upload-first flow.** When the app loads with a valid API key, show a new
   upload screen before the editor. The user picks an image, clicks "Continue
   to editor", and the editor opens with that image already loaded, selected,
   and the Translate panel open.
2. **Photo editor UI.** Replace the Design Editor configuration with a
   Photo Editor configuration (mirroring `starterkit-photo-editor-ts-web`).
   Trim the dock to two entries: **Uploads** and **Translate**. Nothing else.
3. **Three models only.** The Translate panel offers exactly three models —
   Nano Banana Pro, GPT Image 2, Seedream 4.5 — hard-coded as a constant.
   No live catalog fetch.

A back button in the editor's navigation bar returns the user to the upload
screen.

## State machine

The app has three terminal screens. `src/index.ts` picks one at load time and
transitions only on explicit user action (Continue, Back).

```
                 no API key
        ┌──────────────────────► onboarding (existing, unchanged)
load ───┤
        │              ┌── Continue with file ──┐
        └─ API key ────┤                        ▼
                       └─►   upload    ─────────►   editor
                              ▲
                              │ Back
                              └────────────────────┘
```

Reload re-enters from the top. There is no persistence — uploaded images are
not saved across reloads.

## File layout

```
src/imgly/
├── index.ts                          # initPhotoEditor (renamed from initDesignEditor)
└── plugins/
    ├── upload/                       # NEW
    │   ├── index.ts                  # public exports
    │   ├── upload.ts                 # renderUploadScreen + drop/click/preview DOM
    │   └── upload.css                # styles (shares conventions with onboarding.css)
    └── translate/                    # existing
        ├── providers.ts              # TRANSLATE_MODELS allow-list (replaces dynamic catalog)
        ├── panel.ts                  # drop catalog scaffolding, use TRANSLATE_MODELS
        └── catalog.ts                # DELETE (no longer used)

photo-editor/                         # NEW — copied verbatim from starterkit-photo-editor-ts-web,
├── plugin.ts                         #        then edited as described below
├── ui/
│   ├── dock.ts                       # ONLY Translate + Uploads
│   ├── navigationBar.ts              # adds Back button at position: 'start'
│   ├── canvas.ts, components.ts,
│   │   inspectorBar.ts, panel.ts,
│   │   index.ts                      # verbatim from starter kit
├── actions.ts, features.ts,
│   i18n.ts, settings.ts              # mostly verbatim; features.ts trims element toggles

design-editor/                        # DELETE — replaced by photo-editor/
```

## `src/index.ts`

```typescript
import CreativeEditorSDK from '@cesdk/cesdk-js';
import { initPhotoEditor } from './imgly';
import {
  getApiKey,
  renderOnboardingScreen,
  setConfiguredApiKey
} from './imgly/plugins/translate';
import { renderUploadScreen } from './imgly/plugins/upload';
import { TRANSLATE_PANEL_ID } from './imgly/plugins/translate';

setConfiguredApiKey(import.meta.env.VITE_AI_API_KEY ?? '');

const container = document.querySelector<HTMLDivElement>('#cesdk_container');
if (!container) {
  console.error('No #cesdk_container element found.');
} else {
  showCurrentScreen(container);
}

function showCurrentScreen(container: HTMLDivElement): void {
  if (!getApiKey()) {
    renderOnboardingScreen(container, { reason: 'missing' });
    return;
  }
  renderUploadScreen(container, {
    onContinue: (file) => {
      const objectURL = URL.createObjectURL(file);
      void mountEditor(container, objectURL);
    }
  });
}

async function mountEditor(
  container: HTMLDivElement,
  objectURL: string
): Promise<void> {
  container.innerHTML = '';
  let cesdk: CreativeEditorSDK;
  try {
    cesdk = await CreativeEditorSDK.create(container, {
      userId: 'starterkit-photo-translate-user'
    });
  } catch (err) {
    console.error('Failed to initialize CE.SDK:', err);
    renderOnboardingScreen(container, { reason: 'invalid' });
    URL.revokeObjectURL(objectURL);
    return;
  }
  (window as unknown as { cesdk: CreativeEditorSDK }).cesdk = cesdk;

  await initPhotoEditor(cesdk, {
    onBack: () => navigateBackToUpload(container, cesdk)
  });

  try {
    await cesdk.createFromImage(objectURL);
  } catch (err) {
    console.error('Failed to load image into editor:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not load image — try a different file.',
      duration: 'medium'
    });
    navigateBackToUpload(container, cesdk);
    return;
  } finally {
    URL.revokeObjectURL(objectURL);
  }

  const imageBlock = findFirstImageBlock(cesdk.engine);
  if (imageBlock != null) cesdk.engine.block.select(imageBlock);
  cesdk.ui.openPanel(TRANSLATE_PANEL_ID);
}

function navigateBackToUpload(
  container: HTMLDivElement,
  cesdk: CreativeEditorSDK
): void {
  cesdk.dispose();
  delete (window as unknown as { cesdk?: unknown }).cesdk;
  showCurrentScreen(container);
}

function findFirstImageBlock(engine: CreativeEditorSDK['engine']): number | null {
  const pages = engine.scene.getPages();
  for (const page of pages) {
    for (const child of engine.block.getChildren(page)) {
      if (!engine.block.supportsFill(child)) continue;
      const fill = engine.block.getFill(child);
      if (engine.block.getType(fill) === '//ly.img.ubq/fill/image') return child;
    }
  }
  return null;
}
```

`select` is called **before** `openPanel`. The Translate panel renderer reads
selection at render time; by ordering this way the first render already shows
the form, not the "Select an image block" empty state.

## Upload screen (`src/imgly/plugins/upload/`)

### Public API

```typescript
export interface RenderUploadScreenOpts {
  onContinue: (file: File) => void;
}

/** Replaces `root`'s contents with the upload screen. Single-instance. */
export function renderUploadScreen(
  root: HTMLElement,
  opts: RenderUploadScreenOpts
): void;
```

### Layout

A centered card inside `#cesdk_container`. Visual structure (top to bottom):

- Badge: "Step 1 of 2"
- Title: "Pick an image to translate"
- Lead paragraph: "Upload a photo that contains text. The editor will open with
  it loaded and the Translate panel ready."
- Drop zone (`<button type="button">`) showing one of two states:
  - **Idle**: dashed border, upload icon, label "Drop image or click to browse".
  - **Selected**: thumbnail (max 240×240, `object-fit: contain`), filename, and
    a "Change" link that re-opens the file picker.
- Continue button (primary). Disabled until a file is selected.

A hidden `<input type="file" accept="image/*">` is triggered programmatically
on drop-zone click; this gives keyboard focus + activation for free.

### Interaction

| Event                                              | Behavior                                                  |
|----------------------------------------------------|-----------------------------------------------------------|
| Click drop zone (idle or selected)                 | Open file picker.                                         |
| File picker returns a file                         | If `file.type` starts with `image/` → selected state; else inline error. |
| `dragenter` / `dragover` on drop zone              | Add hover class. `dragover` must `preventDefault()`.       |
| `dragleave`                                        | Remove hover class.                                       |
| `drop` with one image file                         | Selected state.                                           |
| `drop` with non-image                              | Inline error "Pick an image file (PNG, JPG, …)."         |
| `drop` with multiple files                         | Take `files[0]`, ignore the rest.                         |
| Click "Change"                                     | Reset to idle, open file picker.                          |
| Click Continue                                     | Invoke `opts.onContinue(file)`.                           |

### Styling

A new `upload.css` mirrors the design tokens already used by `onboarding.css`
(class prefix `tr-up-*`, same card, button, and badge styles). The two screens
are visually a set.

### Out of scope

- Paste-image support.
- Multi-file batching.
- URL upload.
- Drag-to-reorder, drag-to-remove, EXIF rotation, format conversion.
- File-size caps (the gateway will reject what it cannot handle).

## Photo editor config (`photo-editor/`)

Copied verbatim from `starterkit-photo-editor-ts-web/photo-editor/`, then edited
as follows.

### Dock — `photo-editor/ui/dock.ts`

Replace the starter kit's dock order (Crop, Adjust, Filter, Effects, separator,
Text, Shapes, Stickers) with exactly:

```typescript
ui.setComponentOrder({ in: 'ly.img.dock' }, [
  TRANSLATE_DOCK_ID,                         // imported from translate/panel.ts
  {
    id: 'ly.img.assetLibrary.dock',
    key: 'ly.img.upload',
    icon: '@imgly/Upload',
    label: 'libraries.ly.img.upload.label',
    entries: ['ly.img.image.upload']
  }
]);
```

Translate first (the demo's primary action), Uploads second (for swapping the
source image without going back).

### Navigation bar — `photo-editor/ui/navigationBar.ts`

Add a Back button at `position: 'start'`. It is the first thing in the
navigation bar, on the left edge.

```typescript
const BACK_BUTTON_ID = 'photo.translate.back';

cesdk.ui.registerComponent(BACK_BUTTON_ID, ({ builder }) => {
  builder.Button(`${BACK_BUTTON_ID}.button`, {
    label: 'navigationBar.back',
    icon: '@imgly/ChevronLeft',          // verify exact icon name when implementing
    onClick: () => opts.onBack()         // opts passed in via PhotoEditorConfig
  });
});

cesdk.ui.insertOrderComponent(
  { in: 'ly.img.navigation.bar', position: 'start' },
  BACK_BUTTON_ID
);
```

i18n: `'navigationBar.back': 'Back'`.

The `onBack` handler is the one passed to `initPhotoEditor` from `src/index.ts`;
it disposes the CE.SDK instance and re-renders the upload screen. No confirm
prompt — the user can always re-upload from the editor's Uploads dock entry if
they want a different image instead of full back-nav.

### Features — `photo-editor/features.ts`

Audit feature toggles to disable anything that would let the user add a new
non-image block or a new page. Concretely (exact keys verified during
implementation):

- Disable text / shape / sticker element toggles.
- Disable page-add / page-carousel UI (single-page demo).
- Keep crop / adjustments / filters / effects accessible via the inspector bar
  (they're the photo editor's reason to exist).

### `initPhotoEditor` — `src/imgly/index.ts`

Renamed from `initDesignEditor`. Baselined on `starterkit-photo-editor-ts-web`'s
`src/imgly/index.ts` rather than on the current (design-editor) file — the
photo starter's asset-source set is the right starting point.

Signature changes to take an options object so the editor can be re-rendered
with a back-handler:

```typescript
export async function initPhotoEditor(
  cesdk: CreativeEditorSDK,
  opts: { onBack: () => void }
): Promise<void>;
```

Changes from the photo starter kit's baseline:

- Imports `PhotoEditorConfig` from `../../photo-editor/plugin` (same path as
  the starter); the config plugin takes `opts.onBack` so the navigation bar
  component can read it. Cleanest wiring: `new PhotoEditorConfig({ onBack })`.
- Adds the `UploadAssetSources({ include: ['ly.img.image.upload'] })` plugin —
  required by the Uploads dock entry's source. (The photo starter doesn't
  include it because its dock has no Uploads entry.)
- Adds the Translate plumbing: `setupTranslatePlugin` with the env-resolved
  api key + gateway URL. (The eager `installTranslateCredentials` call from
  today's code is no longer needed — it only existed because the AI image
  plugin called `fetchSchema` during `addPlugin`, and we're dropping that
  plugin.)
- Drops the export-image navigation-bar button registered by the starter — the
  navigation bar's existing dropdown actions cover export. (Optional: keep it
  if you want a one-click export button visible.)
- **Does not** call `cesdk.loadFromURL(...)` — scene loading is the caller's
  responsibility (`mountEditor` does `createFromImage`). The photo starter
  loads a fashion-ad scene by default; we don't.
- Keeps every other asset source from the photo starter verbatim:
  `BlurAssetSource`, `ImageColorsAssetSource`, `ColorPaletteAssetSource`,
  `CropPresetsAssetSource`, `EffectsAssetSource`, `FiltersAssetSource`,
  `PagePresetsAssetSource`, `StickerAssetSource`, `TextAssetSource`,
  `TextComponentAssetSource`, `TypefaceAssetSource`,
  `VectorShapeAssetSource`. They power the inspector bar's Filter / Effects /
  Crop tools and the contextual asset libraries — those stay even though the
  dock is trimmed, because "only Uploads + Translate **in the dock**" doesn't
  imply "remove all other photo features".
- Keeps `setupBackgroundRemovalPlugin`.
- The bonus AI image-edit dock entry (`ImageGeneration` plugin call from the
  current `src/imgly/index.ts`) is dropped entirely — it would put a third
  entry in the dock.

The current code's design-editor-specific navigation-bar action group
(`ly.img.actions.navigationBar` with save/export/export-PDF/etc.) is removed
along with the rest of the design-editor wiring.

## Model allow-list (`src/imgly/plugins/translate/`)

### `providers.ts`

Add the allow-list, remove dynamic-catalog plumbing:

```typescript
export interface TranslateModel {
  /** Gateway model id (passed to client.generate). */
  id: string;
  /** Label shown in the dropdown. */
  label: string;
}

export const TRANSLATE_MODELS: readonly TranslateModel[] = [
  { id: 'google/nano-banana-pro-edit', label: 'Nano Banana Pro' },
  { id: 'openai/gpt-image-2-edit',     label: 'GPT Image 2' },
  { id: 'bytedance/seedream-4.5-edit', label: 'Seedream 4.5' }
] as const;
```

`CURATED_IMAGE_EDIT_MODEL_IDS` and `instantiateGatewayProviders` are removed
along with the `ImageGeneration` plugin call.

### `panel.ts`

Delete:

- `import { fetchImageEditCatalog, type TranslateCatalogEntry } from './catalog';`
- Module-level `catalog`, `catalogVersion`, `notifyPanelRerender`, `setCatalog`,
  `loadCatalog`.
- The `state('translate.catalogVersion', ...)` bridge inside the renderer.
- The "Loading available models…" and "Could not load models…" hint rows.
- The Retry button.
- The `catalogReady` gate on the Translate button's `isDisabled`.

Replace dropdown wiring with:

```typescript
const dropdownValues = TRANSLATE_MODELS.map((m) => ({ id: m.id, label: m.label }));
const effectiveModelId = modelId.value || TRANSLATE_MODELS[0].id;
const selectValue = dropdownValues.find((v) => v.id === effectiveModelId)
                  ?? dropdownValues[0];

builder.Select('translate.model', {
  inputLabel: 'panel.translate.model',
  values: dropdownValues,
  value: selectValue,
  setValue: (v) => modelId.setValue(v.id)
});
```

Delete i18n keys: `panel.translate.catalog.loading`,
`panel.translate.catalog.error`, `panel.translate.retry`.

### `catalog.ts`

Delete the file.

## Auto-select + auto-open Translate panel

After `cesdk.createFromImage` resolves:

1. `findFirstImageBlock(cesdk.engine)` walks the scene's first page's children
   and returns the first child that has an image fill. Same predicate as
   `pickImageFillBlock` in `translate/panel.ts`, so anything found here will
   pass the panel's selection gate.
2. `engine.block.select(imageBlock)`.
3. `cesdk.ui.openPanel(TRANSLATE_PANEL_ID)`.

If `findFirstImageBlock` returns `null` (defensive — shouldn't happen with
`createFromImage`), the panel still opens and falls back to its existing
"Select an image block" empty state.

The auto-open is a one-shot: it does not re-trigger if the user closes the
panel or replaces the image via the Uploads dock entry. The dock button stays
available for re-opening.

## Back-to-upload navigation

A Back button in the navigation bar's leftmost slot. On click:

1. `cesdk.dispose()` — releases the engine and the canvas.
2. Clear the `window.cesdk` debug reference.
3. Re-render the upload screen into the same container.

No confirmation prompt. The current scene's edits are discarded — same as
reloading the page.

## Error handling

| Failure                                          | Response                                                                                                       |
|--------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Non-image file picked / dropped                  | Inline message under drop zone. Stay on upload screen.                                                         |
| `CreativeEditorSDK.create` throws                | Log to console; render onboarding screen with `reason: 'invalid'`.                                             |
| `cesdk.createFromImage` throws                   | Show CE.SDK `type: 'error'` notification, dispose the editor, return to upload screen.                         |
| `findFirstImageBlock` returns `null`             | Panel opens; falls back to existing "Select an image block" state. Not surfaced as error.                      |
| Translate per-language failure                   | Existing behavior (per-language notification) unchanged.                                                       |

## Non-goals

- Persisting uploaded images across reloads (sessionStorage, IndexedDB).
- A scene-restore deep-link.
- Browse-by-URL or paste-URL on the upload screen.
- Multi-file upload.
- EXIF auto-rotation.
- Format-specific guardrails (HEIC, AVIF). Anything the browser accepts is
  forwarded to CE.SDK; CE.SDK and the gateway decide what they can decode.
- Telemetry / analytics.
- Automated tests. (Per user instruction.)

## Files changed

### New

- `src/imgly/plugins/upload/index.ts`
- `src/imgly/plugins/upload/upload.ts`
- `src/imgly/plugins/upload/upload.css`
- `photo-editor/plugin.ts`
- `photo-editor/actions.ts`
- `photo-editor/features.ts`
- `photo-editor/i18n.ts`
- `photo-editor/settings.ts`
- `photo-editor/ui/index.ts`
- `photo-editor/ui/canvas.ts`
- `photo-editor/ui/components.ts`
- `photo-editor/ui/dock.ts`
- `photo-editor/ui/inspectorBar.ts`
- `photo-editor/ui/navigationBar.ts`
- `photo-editor/ui/panel.ts`

### Modified

- `src/index.ts` — state machine, `mountEditor`, `navigateBackToUpload`,
  `findFirstImageBlock`.
- `src/imgly/index.ts` — `initPhotoEditor` (renamed, options object, drop
  unused asset sources, drop AI image-edit plugin, drop scene load).
- `src/imgly/plugins/translate/providers.ts` — add `TRANSLATE_MODELS`, remove
  dynamic-catalog helpers.
- `src/imgly/plugins/translate/panel.ts` — drop catalog scaffolding, use
  `TRANSLATE_MODELS` directly.
- `src/imgly/plugins/translate/index.ts` — remove `CURATED_IMAGE_EDIT_MODEL_IDS`
  / `instantiateGatewayProviders` re-exports if any.
- `README.md` — rewrite the Translate section for the upload-first flow;
  remove references to selecting an image block in a multi-page document.

### Removed

- `design-editor/` — entire folder.
- `src/imgly/plugins/translate/catalog.ts` — dynamic catalog logic.

## README updates

The Translate section (currently lines 133–181 of `README.md`) is rewritten to
describe the new flow. Key points:

- The app opens to an upload screen (the editor is not the entry point).
- Drop or pick an image with text → click Continue → editor opens with the
  image already loaded and the Translate panel open.
- The dock contains Uploads and Translate.
- Three models: Nano Banana Pro, GPT Image 2, Seedream 4.5.
- Pick languages, click Translate, get one new page per language.
- Back button in the top-left returns to the upload screen.
- The smoke checklist is removed (per "no tests needed").
