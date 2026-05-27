# Translate Images on the Canvas — Design

**Status:** Approved 2026-05-27
**Scope:** Add a "Translate" feature to the CE.SDK Design Editor starter kit that takes a selected image block with rasterized text and produces one new page per chosen target language, each containing a version of the image with its text translated by an image-edit LLM accessed through the IMG.LY proxy/gateway.

## Goals

- A new **Translate** dock entry that opens a custom side panel.
- Panel contains: a **model dropdown** (image-edit models available via the IMG.LY gateway), a **language checkbox group** (German, English, Spanish, Russian, Chinese), and a **Translate** button.
- On Translate: for every checked language, call the selected model with the source image and a translation prompt, then append a new page containing only the translated image. Source page is left unchanged.
- The set of available models is shared with the official `@imgly/plugin-ai-image-generation-web` plugin, registered alongside this feature, so users still get the plugin's regular image-edit experience.

## Non-Goals

- Translating text blocks (vector text) on the canvas — only rasterized text inside image fills.
- User-selected source language. The image-edit model auto-detects the source.
- Editing the in-place image. Output is always new pages.
- Automated tests. Verification is by manual smoke testing.
- Streaming progress per language. One combined result toast at the end.

## Approach

Hybrid: install `@imgly/plugin-ai-image-generation-web` with an array of image-edit providers, **and** ship a self-contained custom Translate feature that talks to the same proxy directly. Both surfaces share one provider list (`providers.ts`).

Rejected alternatives:

- *Pure custom (skip the AI plugin)* — loses the bonus image-edit dock entry the plugin gives for free.
- *Quick-action on the plugin's image-edit panel* — doesn't fit the "checkbox a batch of languages" UX.
- *Driving the AI plugin's providers programmatically from our panel* — no documented public API for that.

## Architecture

All new code lives under `src/imgly/plugins/translate/`, mirroring the existing `background-removal.ts` pattern. Five focused modules:

```
src/imgly/plugins/translate/
├── index.ts            # setupTranslatePlugin(cesdk, { proxyUrl }) — wires everything
├── providers.ts        # Shared provider list: id, label, kind (fal|openai), modelKey
├── panel.ts            # Registers custom panel + dock entry; defines panel UI
├── translate.ts        # translateImage(): pure provider invocation, two adapters
└── pages.ts            # appendTranslatedPage(): pure scene mutation
```

Each module has one clear job; consumers depend only on a small public surface.

### Modules

#### `providers.ts`

```ts
export type TranslateProvider = {
  id: string;          // 'fal-ai/nano-banana/edit'
  label: string;       // 'NanoBananaEdit'
  kind: 'fal' | 'openai';
  modelKey: string;    // identifier the gateway expects
};

export const TRANSLATE_PROVIDERS: TranslateProvider[] = [
  // NanoBananaEdit, Gemini25FlashImageEdit, GeminiFlashEdit,
  // FluxProKontextEdit, QwenImageEdit, SeedreamV4Edit (fal kind)
  // GptImage1.Image2Image (openai kind)
];
export const DEFAULT_PROVIDER_ID = 'fal-ai/nano-banana/edit';
```

Single source of truth. `src/imgly/index.ts` maps this list into AI-plugin provider instances at startup; `panel.ts` renders it into the dropdown.

#### `translate.ts`

```ts
export async function translateImage(args: {
  image: Blob;
  targetLanguage: string;
  providerId: string;
  proxyUrl: string;
  signal?: AbortSignal;
}): Promise<Blob>;
```

Internally dispatches on `provider.kind`:

- `callFalProvider(modelKey, prompt, image, proxyUrl, signal)` — uses `@fal-ai/client` (transitive dep of the AI plugin) configured with the proxy URL; calls `fal.subscribe(modelKey, { input })` and fetches the resulting image URL into a Blob.
- `callOpenAiProvider(modelKey, prompt, image, proxyUrl, signal)` — multipart `fetch` to `${proxyUrl}/openai/v1/images/edits` with `image[]`, `prompt`, `model`; parses the b64/url response into a Blob.

A single prompt template is used:

> *Translate every piece of visible text in this image to {language}. Preserve the original layout, typography, colors, and visual composition exactly — only replace the text content. Do not add, remove, or restyle anything else.*

Errors propagate as `TranslateError` carrying `{ language, providerId, cause }` so the panel can produce a useful toast without inspecting low-level errors.

#### `pages.ts`

```ts
export async function appendTranslatedPage(
  cesdk: CreativeEditorSDK,
  sourcePageId: number,
  translated: Blob,
  label: string,
): Promise<void>;
```

Creates a new page sibling-of-source with matching `width`/`height`, writes the Blob into a `buffer://` URI via `engine.editor.createBufferURI` + `setBufferData` (lives inside the scene; no `objectURL` leakage on reload), creates an image block sized to fill the page, names the page after `label`.

#### `panel.ts`

Registers:

- A custom panel `'//ly.img.panel/translate'` using `cesdk.ui.registerPanel(...)` with the builder API. Contents: select input (model), checkbox group (5 languages), Translate button.
- A dock entry `'translate'` with icon `@imgly/Translate` that opens the panel via `cesdk.ui.openPanel`.

Panel reads selection state per render and subscribes to `engine.editor.onStateChanged`. Derived state:

- `selectedImageBlock`: the single selected block iff it has an image fill — else `null`.
- `canTranslate`: `selectedImageBlock !== null && targetLanguages.length > 0 && !isRunning`.

Disabled-button hint appears inline under the button (e.g. *"Select an image block to translate."*). No error toast for no-op clicks.

#### `index.ts`

```ts
export function setupTranslatePlugin(
  cesdk: CreativeEditorSDK,
  opts: { proxyUrl: string },
): void;
```

Calls `setupTranslatePanel(cesdk, opts)`. Future additions (e.g. analytics middleware) hook in here.

### Wiring into the editor

`src/imgly/index.ts` adds, after existing setup:

```ts
import ImageGeneration from '@imgly/plugin-ai-image-generation-web';
import { TRANSLATE_PROVIDERS } from './plugins/translate/providers';
import { toAiPluginProvider } from './plugins/translate/providers';
import { setupTranslatePlugin } from './plugins/translate';

const proxyUrl =
  import.meta.env.VITE_IMGLY_AI_PROXY_URL ?? DEFAULT_PROXY_URL;

await cesdk.addPlugin(
  ImageGeneration({
    image2image: TRANSLATE_PROVIDERS.map((p) => toAiPluginProvider(p, proxyUrl)),
  }),
);
setupTranslatePlugin(cesdk, { proxyUrl });
```

`toAiPluginProvider` is a small helper in `providers.ts` that maps a `TranslateProvider` row to the corresponding `FalAiImage.X({...})` / `OpenAiImage.Y({...})` instance.

### Configuration

- `.env.example` documents `VITE_IMGLY_AI_PROXY_URL`.
- If the env var is unset, fall back to `DEFAULT_PROXY_URL`, a constant exported from `providers.ts` and clearly commented as a placeholder to be replaced by the developer.
- README gains a short "AI / Translate" section: install the new package, set the env var, run.

## Data Flow

On panel open:

- Read selection; subscribe to `engine.editor.onStateChanged` for re-renders.

On Translate click (one `try/finally` resetting `isRunning`):

1. Capture `block`, `sourcePageId`, source `width`/`height` synchronously.
2. Export the source image once: `engine.block.export(fill, 'image/png')`.
3. Set `isRunning = true`; create an `AbortController`; button becomes "Cancel".
4. Fan out: `Promise.allSettled(targetLanguages.map(lang => translateImage(...)))`. Parallel — total ≈ slowest call.
5. Iterate results **in original language order** and sequentially `await appendTranslatedPage(...)` for each fulfilled result. Sequential commit because the scene graph isn't safe for concurrent mutations and ordering must be deterministic.
6. Wrap the commit phase so a single `engine.editor.addUndoStep()` covers the whole run — one ⌘Z undoes all added pages.
7. Show one combined toast: `"3 pages added; Russian failed — see console for details"`.

## Error Handling

| Condition | Behavior |
| --- | --- |
| No selection / non-image selection | Translate button disabled with inline hint. No toast. |
| Zero languages checked | Translate button disabled with inline hint. No toast. |
| Per-language API failure | Captured by `Promise.allSettled`; error logged with language + provider; folded into final toast. |
| Network / proxy error | Surfaces as `TranslateError`; same toast pathway. |
| User clicks Cancel | `AbortController.abort()`; commit phase skipped; "Translation cancelled" toast; no partial pages added. |
| Proxy URL missing | Init warning in console; first Translate click shows toast: *"AI proxy URL not configured. Set `VITE_IMGLY_AI_PROXY_URL` in `.env`."* |
| Image with no visible text | Not pre-flighted. Model returns the image largely unchanged; acceptable for a demo. |

## Verification

Manual smoke checklist (documented at the bottom of the README's "Translate" section):

1. Open the editor, load the default marketing scene, select the image block.
2. Open the Translate dock entry — panel opens, model dropdown populated, languages unchecked.
3. Check German, click Translate — one new page is appended with translated image; original page unchanged; ⌘Z undoes the new page.
4. Re-select source image, check three languages, click Translate — three new pages appended in checked order.
5. During a run, click Cancel — no pages are appended; toast confirms cancellation.
6. Unset `VITE_IMGLY_AI_PROXY_URL`, restart, click Translate — clear toast about missing proxy URL.

## Open Implementation Questions

The following will be resolved during implementation (not blocking on design):

- Exact symbol for `toAiPluginProvider` mappings — confirmed against the package's exports.
- Whether `@imgly/Translate` icon exists in CE.SDK 1.75.x; if not, fall back to `@imgly/Language` or a custom SVG.
- Exact `engine.block.export` MIME for largest-model compatibility (PNG vs JPEG) — start with PNG.
- Default value for `DEFAULT_PROXY_URL` — empty string with a clear error path is safest.
