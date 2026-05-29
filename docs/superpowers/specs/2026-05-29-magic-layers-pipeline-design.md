# Magic Layers pipeline — design

Status: approved
Date: 2026-05-29

## Summary

Implement the Magic Layers translation pipeline end-to-end. A single
gateway call to the new `imgly/image-to-scene` model converts the source
image into a CE.SDK scene whose layers — including editable text blocks —
can be mutated. The pipeline loads that scene N times, batch-translates
the text content per language via `openai/gpt-5.4-mini`, and appends one
translated page per language to the document. The Magic Layers Translate
button stops being a no-op; the upload screen drops "(Coming soon)".

## Motivation

The previous spec wired the UI switch but disabled the Translate button
for Magic Layers because the gateway model wasn't available. The new
`imgly/image-to-scene` model is now deployed on production. With it, the
pipeline produces a real editable scene per language: text translation
runs as a separate text-only LLM call so users get the cross-block
context and terminology consistency that batched translation provides.

## Architecture

Two new files inside the translate plugin and one small refactor:

```
src/imgly/plugins/translate/
├── providers.ts            # +MAGIC_LAYERS_MODEL_ID; drop "(Coming soon)"
├── translate.ts            # +getGatewayClient()  — singleton accessor
├── translateTexts.ts       # NEW — gateway adapter, batch text translation
├── magicLayers.ts          # NEW — orchestrator
├── panel.ts                # Dispatch on opts.pipeline
└── …
```

Module responsibilities:

- **`translateTexts.ts`** — pure gateway adapter. Takes an array of
  strings + target language, returns an array of translated strings via
  `client.generateStream('openai/gpt-5.4-mini', { prompt })`. Throws on
  any drift (non-JSON response, length mismatch, non-string entries).
  Knows nothing about CE.SDK.

- **`magicLayers.ts`** — CE.SDK-specific orchestrator. Exports the
  source block as PNG, uploads it, calls `imgly/image-to-scene`, then
  for each language: loads the returned archive, walks for text blocks,
  calls `translateTexts` once with the full array, replaces each text
  in place, names and appends the page.

- **`translate.ts`** keeps its existing image-translation logic. Gains a
  `getGatewayClient()` accessor so `translateTexts.ts` can reuse the
  configured singleton without duplicate setup.

- **`panel.ts`** dispatches on `opts.pipeline`: `'direct'` calls
  `runTranslation` (today's path), `'magic-layers'` calls
  `runMagicLayersTranslation`. The disabled-button + `notImplemented`
  hint branches added in the previous spec are removed; the button
  follows the same rules as Direct.

## Data flow per Translate click (Magic Layers)

```
panel.onClick (pipeline === 'magic-layers')
  → runMagicLayersTranslation({ cesdk, sourceBlock, languages })
     1. const blob   = await engine.block.export(sourceBlock, { mimeType: 'image/png' })
        const upload = await client.upload(blob, 'image/png')
     2. const outputUrl = await client.generate(
                              'imgly/image-to-scene',
                              { image_url:  upload.asset_url,
                                image_urls: [upload.asset_url] },
                              {})
        // returns "data:application/zip;base64,…"
     3. For each language in parallel (Promise.allSettled):
          a. const [page] = await engine.block.loadFromArchiveURL(outputUrl)
          b. const textBlocks = collectTextBlocks(engine, page)
          c. const originals  = textBlocks.map(tb =>
                                  engine.block.getString(tb, 'text/text'))
             const translated = await translateTexts({
                                  texts: originals,
                                  targetLanguagePromptName: lang.promptName
                                })
          d. textBlocks.forEach((tb, i) =>
                 engine.block.replaceText(tb, translated[i]))
          e. engine.block.setName(page, lang.label)
          f. engine.block.appendChild(sceneParent, page)
     4. engine.editor.addUndoStep()
     5. cesdk.ui.showNotification(...)  // success / partial / failure
```

### Key choices

- **Image-to-scene runs once.** The data URL it returns is fed N times
  into `loadFromArchiveURL`, giving each language an independent copy
  of the scene to mutate.
- **Per-language failure isolation** via `Promise.allSettled` — matches
  the direct pipeline. One language failing does not block the others.
- **Text translation is all-or-nothing per language.** The batch
  translation either succeeds for every text in a language or marks
  that language as failed. A half-translated page is a worse outcome
  than a missing language; the notification shape already exists.
- **Text walking is recursive.** Text blocks may be nested inside
  groups depending on what the model emits. `collectTextBlocks` walks
  children and collects any block whose type ends in `/text`.
- **Empty case is fine.** If a returned scene has zero text blocks,
  `translateTexts` short-circuits to `[]` and the page is still
  appended (no-op translation). The notification still reports the
  page as added.
- **Append target.** New pages become siblings of the source page —
  `engine.block.getParent(sourcePageId)`. Order in the document is
  original → first language → second language → ….

## Gateway adapter — translateTexts

```ts
// src/imgly/plugins/translate/translateTexts.ts
import { getGatewayClient } from './translate';

const TEXT_MODEL_ID = 'openai/gpt-5.4-mini';

const SYSTEM_PROMPT =
  'You are a translator. Translate every item in the JSON array below into ' +
  '{language}. Preserve tone and register; use consistent terminology across ' +
  'items (they are pieces of one design). Respond with ONLY a JSON array of ' +
  'strings, in the same order and same length as the input. Do not wrap the ' +
  'array in markdown or add commentary.';

export async function translateTexts(args: {
  texts: string[];
  targetLanguagePromptName: string;
}): Promise<string[]> {
  if (args.texts.length === 0) return [];

  const client = getGatewayClient();
  if (!client) {
    throw new Error('translateTexts: gateway client not configured');
  }

  const prompt =
    SYSTEM_PROMPT.replace('{language}', args.targetLanguagePromptName) +
    '\n\nInput:\n' +
    JSON.stringify(args.texts);

  // Drain the stream — generateStream returns the final accumulated text
  // as the AsyncGenerator's return value; for-await-of only sees yields.
  const stream = client.generateStream(TEXT_MODEL_ID, { prompt }, {});
  let final = '';
  while (true) {
    const { value, done } = await stream.next();
    if (done) { final = value; break; }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(final);
  } catch (err) {
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

Why batched + structured:

- **Cross-block context.** A poster has a headline, a CTA, a footnote.
  Given them together, the model picks consistent terminology and
  appropriate register. One request per block can't do that.
- **Lower cost.** One prompt overhead vs. N. Real for posters with
  many text blocks.
- **Failure mode.** Batch is all-or-nothing per language; per-block
  could ship a page with one untranslated string. For a translation
  product, "missing language" is a better error to surface than
  "almost-translated page."
- **Validation is cheap.** Length check + type check + JSON parse
  catches every realistic drift. No retry logic — the throw flows up
  to the language's `allSettled` slot.

## Panel — dispatch on pipeline

`panel.ts` removes the `isMagicLayers` early-return guard, removes
`isMagicLayers` from `isDisabled`, removes the `notImplemented` hint
branch, and dispatches on `opts.pipeline` inside `onClick`:

```ts
onClick: () => {
  const block = selectedImageBlock;
  if (!block) return;
  isRunning.setValue(true);
  const run =
    opts.pipeline === 'magic-layers'
      ? runMagicLayersTranslation({ cesdk, block, languages: selectedLanguages })
      : runTranslation({ cesdk, modelId: effectiveModelId,
                          block, languages: selectedLanguages });
  void run.finally(() => isRunning.setValue(false));
}
```

The `panel.translate.hint.notImplemented` i18n key is removed.

## Files touched

| File | Change |
|---|---|
| `src/imgly/plugins/translate/providers.ts` | Add `MAGIC_LAYERS_MODEL_ID = 'imgly/image-to-scene'`; drop `(Coming soon)` from the Magic Layers description |
| `src/imgly/plugins/translate/translate.ts` | Export `getGatewayClient(): GatewayClient \| null` |
| `src/imgly/plugins/translate/translateTexts.ts` | **New** — batch text-translation gateway adapter (`openai/gpt-5.4-mini`) |
| `src/imgly/plugins/translate/magicLayers.ts` | **New** — orchestrator |
| `src/imgly/plugins/translate/panel.ts` | Dispatch on `opts.pipeline`; remove magic-layers disabled/hint/guard branches; drop `notImplemented` i18n key |
| `README.md` | Update Pipelines section: Magic Layers no longer "Coming soon"; note the text model in the Models section |

## Out of scope

- Streaming UI feedback per block. Batch is all-or-nothing per language;
  the existing `isRunning` spinner is enough.
- A "retry" button on partial failures. The user re-clicks Translate to
  retry the failed languages; the direct pipeline doesn't offer retry
  either.
- Schema introspection (`client.fetchSchema`). The two model contracts
  are written into the adapters as constants; if a model's schema
  changes, the adapter is the swap point.
- Deduplication if Magic Layers + Direct are alternated on the same
  source image. Each click appends fresh pages; no merge.
- Persisting the Magic Layers scene structure between Translate clicks
  (re-uploading the source each click is fine; one image-to-scene call
  per click is the unit of work).
