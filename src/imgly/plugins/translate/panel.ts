/**
 * Custom Translate panel + dock entry.
 *
 * Registers a panel at `//ly.img.panel/translate` and a dock component
 * that opens it. Reads the live block selection; when a single image-fill
 * block is selected, the user can pick a model, check target languages,
 * and trigger translation. Output is appended as new pages in the scene.
 *
 * ## Adjustments vs. reference implementation
 *
 * 1. `engine.block.export(fill, 'image/png' as never)` → replaced with
 *    `engine.block.export(fill, { mimeType: 'image/png' })` using the
 *    current non-deprecated overload (source: @cesdk/engine/index.d.ts
 *    line 1443).
 *
 * 2. `...providerId` spread into `builder.Select` → replaced with explicit
 *    `value`/`setValue` that convert between the `string` state and the
 *    `SelectValue` shape (`{ id: string; label: string }`) required by
 *    `SelectOptions` (source: @cesdk/cesdk-js/index.d.ts lines 5763-5793).
 *
 * 3. `builder.Text` exists and accepts `{ content: string }` (not
 *    `string | null`), so the `disabledReason` guard is narrowed from
 *    `string | null` to `string` before passing to builder.Text.
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

// One AbortController for the in-flight translation run. There is exactly
// one Translate panel per editor instance, so a module-level handle is
// sufficient and avoids stashing state on the cesdk object.
let currentController: AbortController | null = null;

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

    const selection = engine.block.findAllSelected();
    const selectedImageBlock = pickImageFillBlock(engine, selection);
    const selectedLanguages = TARGET_LANGUAGES.filter(
      (lang) => checked.value[lang.id]
    );

    const proxyConfigured = opts.proxyUrl.length > 0;

    const disabledReason: string | null = !proxyConfigured
      ? 'panel.translate.hint.noProxy'
      : selectedImageBlock == null
      ? 'panel.translate.hint.noSelection'
      : selectedLanguages.length === 0
      ? 'panel.translate.hint.noLanguages'
      : null;

    builder.Section('translate.section', {
      title: 'panel.translate.title',
      children: () => {
        // Adjustment #2: SelectOptions.value must be SelectValue ({ id, label }),
        // not a plain string. Convert from/to the providerId string state.
        const currentProvider = TRANSLATE_PROVIDERS.find(
          (p) => p.id === providerId.value
        );
        const selectValue = currentProvider
          ? { id: currentProvider.id, label: currentProvider.label }
          : { id: providerId.value, label: providerId.value };

        builder.Select('translate.model', {
          inputLabel: 'panel.translate.model',
          values: TRANSLATE_PROVIDERS.map((p) => ({
            id: p.id,
            label: p.label
          })),
          value: selectValue,
          setValue: (v) => providerId.setValue(v.id)
        });

        for (const lang of TARGET_LANGUAGES) {
          builder.Checkbox(`translate.lang.${lang.id}`, {
            inputLabel: lang.label,
            value: !!checked.value[lang.id],
            setValue: (v: boolean) =>
              checked.setValue({ ...checked.value, [lang.id]: v })
          });
        }

        // Adjustment #3: builder.Text exists but content must be string (not
        // null). The disabledReason is only rendered when it is non-null.
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
            isDisabled: disabledReason != null,
            onClick: () => {
              const block = selectedImageBlock;
              if (!block) return;
              const controller = new AbortController();
              currentController = controller;
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
  // Adjustment #1: use current non-deprecated export overload with options
  // object instead of (fill, 'image/png' as never).
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
