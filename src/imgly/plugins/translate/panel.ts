/**
 * Custom Translate panel + dock entry.
 *
 * The model dropdown is the hard-coded TRANSLATE_MODELS allow-list.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { TARGET_LANGUAGES, TRANSLATE_MODELS } from './providers';
import type { TranslatePipeline } from './providers';
import { translateImage, TranslateError } from './translate';
import { appendTranslatedPage } from './pages';
import { runMagicLayersTranslation } from './magicLayers';
import { readOriginalImageBlob } from './sourceImage';

export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
const TRANSLATE_ICON_SET_ID = 'ly.img.translate';
export const TRANSLATE_ICON_ID = `@${TRANSLATE_ICON_SET_ID}/translate`;

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
  /** Pipeline chosen on the upload screen. */
  pipeline: TranslatePipeline;
}

export function setupTranslatePanel(
  cesdk: CreativeEditorSDK,
  opts: SetupTranslatePanelOpts
): void {
  cesdk.ui.addIconSet(TRANSLATE_ICON_SET_ID, TRANSLATE_ICON_SVG);
  registerTranslations(cesdk);
  registerPanel(cesdk, opts);
  // Dock placement is the host config's responsibility (see
  // photo-editor/ui/dock.ts), which uses a structured dock entry with a
  // reactive isSelected predicate.
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
            // 'right' = label on the right side of the checkbox, i.e.
            // checkbox sits on the left. CheckboxOptions extends
            // InputOptions<boolean, 'left' | 'right'>; default is 'left'.
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
            // Start the work only after the loading state has painted. Both
            // pipelines begin with engine.block.export, which resolves the
            // block's layout synchronously on the main thread (~hundreds of
            // ms). Kicking it off in this click handler would block the very
            // frame that paints the button spinner, so the spinner would lag
            // the click. A double requestAnimationFrame resumes after the
            // spinner frame has painted, making the indicator appear at once.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
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
              })
            );
          }
        });
      }
    });
  });
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

/**
 * The first image-fill graphic block on the document's first page —
 * which, in this app, is always the originally uploaded source image.
 * Used as the fallback "source" when the user hasn't selected anything
 * specific, and exported so the bootstrap (src/index.ts) can pre-select
 * it on editor mount with the same predicate.
 */
export function findFirstImageBlockOnFirstPage(
  engine: CreativeEditorSDK['engine']
): number | null {
  const pages = engine.scene.getPages();
  const firstPage = pages[0];
  if (firstPage == null) return null;
  for (const child of engine.block.getChildren(firstPage)) {
    if (!engine.block.supportsFill(child)) continue;
    const fill = engine.block.getFill(child);
    if (engine.block.getType(fill) === '//ly.img.ubq/fill/image') return child;
  }
  return null;
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

  // Prefer the user's original, unmodified bytes (stored as an engine buffer
  // at upload time) over a PNG re-export, which re-encodes the photo
  // losslessly and balloons a source JPEG several-fold for no quality gain.
  // Fall back to export if the fill isn't a readable engine buffer.
  // `translateImage` uploads with `image.type`, so the recovered MIME type
  // flows through.
  let sourceBlob: Blob;
  try {
    sourceBlob =
      readOriginalImageBlob(engine, block) ??
      (await engine.block.export(block, { mimeType: 'image/png' }));
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
