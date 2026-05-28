# Translate pipeline switch — design

Status: approved
Date: 2026-05-28

## Summary

Add a pipeline picker to the upload screen with two options: **Direct** (the
existing pipeline) and **IMG.LY Magic Layers** (image-to-scene; gateway model
ships later). The choice flows from the upload screen through the editor
bootstrap to the Translate panel, which adapts its rendering: Magic Layers
hides the model selector and shows a disabled Translate button with a "coming
soon" hint. The Magic Layers gateway call itself is **out of scope** — this
spec only prepares the switch.

## Motivation

Two translation pipelines are useful:

1. **Direct** — flat-image edit; one gateway request per language; higher visual
   fidelity but text is baked into the output bitmap.
2. **IMG.LY Magic Layers** — image-to-scene transformation; one gateway request
   returns scene files with editable text layers; faster and cheaper for more
   than two translations.

The new image-to-scene model is being built right now and isn't available yet.
We want the UI shape, types, and plumbing in place so the gateway integration
lands as a focused follow-up.

## Domain model

A new domain concept — the **translation pipeline** — lives alongside
`TARGET_LANGUAGES` and `TRANSLATE_MODELS` in
`src/imgly/plugins/translate/providers.ts`:

```ts
export type TranslatePipeline = 'direct' | 'magic-layers';

export interface TranslatePipelineSpec {
  id: TranslatePipeline;
  label: string;
  description: string;
}

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

The translate plugin's `index.ts` re-exports `TranslatePipeline`,
`TRANSLATE_PIPELINES`, and `DEFAULT_TRANSLATE_PIPELINE` so the upload screen
can import from a single place.

## Upload screen

A radio group titled "Translation pipeline" sits **below the dropzone, above
the Continue button**. Each option shows a label and a one-line description.
The default is `direct`.

```
┌─────────────────────────────────────────┐
│ Step 1 of 2                             │
│                                         │
│ Pick an image to translate              │
│                                         │
│ Upload a photo that contains text. …    │
│                                         │
│ ┌───────────────────────────────────┐   │
│ │  [ dropzone ]                     │   │
│ └───────────────────────────────────┘   │
│                                         │
│ Translation pipeline                    │
│ ◉ Direct                                │
│     Flat image with higher fidelity.    │
│ ○ IMG.LY Magic Layers                   │
│     Editable text, faster & cheaper     │
│     for more than 2 translations.       │
│     (Coming soon)                       │
│                                         │
│                       [ Continue → ]    │
└─────────────────────────────────────────┘
```

Both options are always enabled — picking Magic Layers and continuing is not
an error; the editor handles it.

The `RenderUploadScreenOpts` callback signature grows:

```ts
export interface RenderUploadScreenOpts {
  onContinue: (file: File, pipeline: TranslatePipeline) => void;
}
```

The selected pipeline is held in a local variable inside `renderUploadScreen`,
initialized to `DEFAULT_TRANSLATE_PIPELINE`. The radio change handler updates
it; Continue passes it through.

CSS additions follow the existing `.tr-up-*` naming convention
(`.tr-up-pipeline`, `.tr-up-pipeline-title`, `.tr-up-pipeline-option`,
`.tr-up-pipeline-radio`, `.tr-up-pipeline-text`, `.tr-up-pipeline-label`,
`.tr-up-pipeline-desc`) and reuse the existing color palette.

## Plumbing

The pipeline flows: upload screen → `src/index.ts` → `initPhotoEditor` →
`setupTranslatePlugin` → translate panel.

```ts
// src/index.ts
renderUploadScreen(root, {
  onContinue: (file, pipeline) => {
    void mountEditor(root, file, pipeline);
  }
});

async function mountEditor(
  root: HTMLDivElement,
  file: File,
  pipeline: TranslatePipeline
): Promise<void> { … }
```

```ts
// src/imgly/index.ts
export interface InitPhotoEditorOpts {
  onBack: () => void;
  pipeline: TranslatePipeline;
}
// passed through to setupTranslatePlugin({ apiKey, gatewayUrl, pipeline })
```

```ts
// src/imgly/plugins/translate/index.ts
export interface SetupTranslatePluginOpts {
  apiKey: string;
  gatewayUrl?: string;
  pipeline: TranslatePipeline;
}
```

The pipeline is fixed for the editor's lifetime — like the API key. To switch
pipelines, the user clicks **Back**, picks the other option on the upload
screen, and re-mounts the editor. This is the same model the rest of the
upload flow follows: stateless across re-entries, no persistence.

## Translate panel — pipeline-aware rendering

The panel reads `opts.pipeline` and adapts:

### `pipeline === 'direct'`

Unchanged from today:
- Model selector (TRANSLATE_MODELS dropdown).
- Language checkboxes.
- Enabled Translate button that runs the existing `runTranslation` path.

### `pipeline === 'magic-layers'`

- Model selector is **not rendered at all** (the row doesn't exist — not just
  disabled).
- Language checkboxes render exactly as today.
- Translate button is **disabled** (visibly so, not absent), with a hint below
  the language list:

  > Magic Layers translation is coming soon.

  This hint replaces the `noLanguages` hint for the Magic Layers pipeline —
  the button is disabled for a more fundamental reason, so the user shouldn't
  also see "Choose at least one target language." Direct keeps its existing
  `noLanguages` behavior.

A new i18n key carries the hint:

```ts
'panel.translate.hint.notImplemented': 'Magic Layers translation is coming soon.'
```

The existing `runTranslation` function gains a defensive early return if
`pipeline === 'magic-layers'` — the disabled button shouldn't fire `onClick`
anyway, but the guard keeps the behavior explicit at the boundary. No other
changes in `translate.ts` or `pages.ts`; Magic Layers is purely a UI state for
now.

## Files touched

| File | Change |
|---|---|
| `src/imgly/plugins/translate/providers.ts` | Add `TranslatePipeline`, `TRANSLATE_PIPELINES`, `DEFAULT_TRANSLATE_PIPELINE` |
| `src/imgly/plugins/translate/index.ts` | Re-export new types; extend `SetupTranslatePluginOpts.pipeline` |
| `src/imgly/plugins/translate/panel.ts` | Accept pipeline; conditional model selector; disabled Translate button + hint for Magic Layers; new i18n key; defensive guard in `runTranslation` |
| `src/imgly/plugins/upload/upload.ts` | Add pipeline radio group; pipeline state; updated `onContinue` signature |
| `src/imgly/plugins/upload/upload.css` | Styles for `.tr-up-pipeline*` |
| `src/imgly/index.ts` | Thread `pipeline` through `InitPhotoEditorOpts` |
| `src/index.ts` | Thread pipeline through `mountEditor` |
| `README.md` | Brief mention of the pipeline switch under "How translation works" |

## Out of scope

- Actually implementing the Magic Layers gateway call (image-to-scene model).
  The model is being built; integration is a follow-up spec.
- Remembering the pipeline choice across Back-and-forth navigation. Stateless,
  like the rest of the upload screen.
- Pipeline switching from inside the editor. Back to upload only.
- Onboarding screen changes — the pipeline picker is purely an upload-screen
  concept; the onboarding screen still only handles missing/invalid API key.
