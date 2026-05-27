/**
 * Custom Translate panel + dock entry (gateway edition).
 *
 * The model dropdown is populated from a live fetch against the gateway's
 * /v1/models endpoint, filtered to image2image-capable models.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { TARGET_LANGUAGES } from './providers';
import { translateImage, TranslateError } from './translate';
import { appendTranslatedPage } from './pages';
import {
  fetchImageEditCatalog,
  type TranslateCatalogEntry
} from './catalog';

export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
export const TRANSLATE_DOCK_ID = 'ly.img.translate.dock';
const TRANSLATE_ICON_SET_ID = 'ly.img.translate';
const TRANSLATE_ICON_ID = `@${TRANSLATE_ICON_SET_ID}/translate`;

/**
 * Material Design "translate" glyph (Apache 2.0). One symbol named
 * `translate`; referenced via `@ly.img.translate/translate` in the dock
 * button. CE.SDK strokes use `currentColor` so the icon inherits the
 * dock's foreground color automatically.
 */
const TRANSLATE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg">
  <symbol id="translate" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
  </symbol>
</svg>`;

export interface SetupTranslatePanelOpts {
  gatewayUrl: string;
  /** Empty string means "not configured" — panel surfaces a clear toast. */
  apiKey: string;
}

// One AbortController per active translation run.
let currentController: AbortController | null = null;

// Module-level catalog cache so we don't refetch on every panel re-render.
type CatalogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; entries: TranslateCatalogEntry[] }
  | { status: 'error'; message: string };

let catalog: CatalogState = { status: 'idle' };

// Bumped on every catalog transition. The panel's render function seeds
// its reactive state from this counter and re-reads it on each render,
// so catalog mutations propagate to the UI without unbounded subscribers.
let catalogVersion = 0;

// Single registered notifier (set by setupTranslatePanel). Calling it
// after a catalog mutation tells CE.SDK to re-render the panel.
let notifyPanelRerender: (() => void) | null = null;

function setCatalog(next: CatalogState): void {
  catalog = next;
  catalogVersion += 1;
  notifyPanelRerender?.();
}

async function loadCatalog(gatewayUrl: string): Promise<void> {
  if (catalog.status === 'loading') return;
  setCatalog({ status: 'loading' });
  try {
    const entries = await fetchImageEditCatalog(gatewayUrl);
    setCatalog({ status: 'ready', entries });
  } catch (err) {
    setCatalog({
      status: 'error',
      message: err instanceof Error ? err.message : 'Catalog fetch failed.'
    });
  }
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
      'panel.translate.title': 'Translate Image',
      'panel.translate.model': 'Model',
      'panel.translate.translate': 'Translate',
      'panel.translate.cancel': 'Cancel',
      'panel.translate.retry': 'Retry',
      'panel.translate.hint.noSelection':
        'Select an image block to translate.',
      'panel.translate.hint.noLanguages':
        'Choose at least one target language.',
      'panel.translate.hint.noApiKey':
        'AI API key not configured. Set VITE_AI_API_KEY in .env.',
      'panel.translate.catalog.loading': 'Loading available models…',
      'panel.translate.catalog.error': 'Could not load models from the gateway.',
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

    // Kick off the catalog fetch lazily on first render. Idempotent.
    if (apiKeyConfigured && catalog.status === 'idle') {
      void loadCatalog(opts.gatewayUrl);
    }

    // Bind the panel's reactive state to the module-level catalog
    // version. The renderer reads `catalogVersion` once per render;
    // setCatalog() bumps it and calls notifyPanelRerender below to
    // force the next render cycle.
    const version = state('translate.catalogVersion', catalogVersion);
    if (version.value !== catalogVersion) {
      // The module-level counter moved since the last render; sync.
      version.setValue(catalogVersion);
    }
    notifyPanelRerender = () => {
      version.setValue(catalogVersion);
    };

    // Reactive panel state.
    const modelId = state<string>('translate.modelId', '');
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

    // Resolve the effective model id from catalog state.
    let effectiveModelId = modelId.value;
    if (catalog.status === 'ready') {
      const inCatalog = catalog.entries.some((e) => e.id === effectiveModelId);
      if (!inCatalog) effectiveModelId = catalog.entries[0]?.id ?? '';
    } else {
      effectiveModelId = '';
    }

    const catalogReady = catalog.status === 'ready';

    const disabledReason = !apiKeyConfigured
      ? 'panel.translate.hint.noApiKey'
      : !catalogReady
      ? null // disabled, but no hint — catalog status text shows instead
      : selectedImageBlock == null
      ? 'panel.translate.hint.noSelection'
      : selectedLanguages.length === 0
      ? 'panel.translate.hint.noLanguages'
      : null;

    builder.Section('translate.section', {
      title: 'panel.translate.title',
      children: () => {
        // Catalog status / error row.
        if (apiKeyConfigured && catalog.status === 'loading') {
          builder.Text('translate.catalog.status', {
            content: cesdk.i18n.translate('panel.translate.catalog.loading')
          });
        }
        if (catalog.status === 'error') {
          builder.Text('translate.catalog.status', {
            content: `${cesdk.i18n.translate(
              'panel.translate.catalog.error'
            )} ${catalog.message}`
          });
          builder.Button('translate.catalog.retry', {
            label: 'panel.translate.retry',
            onClick: () => {
              setCatalog({ status: 'idle' });
              void loadCatalog(opts.gatewayUrl);
            }
          });
        }

        // Model dropdown — populated from catalog.entries.
        const dropdownEntries =
          catalog.status === 'ready' ? catalog.entries : [];
        const selectValues = dropdownEntries.map((e) => ({
          id: e.id,
          label: e.label
        }));
        const selectValue =
          dropdownEntries.find((e) => e.id === effectiveModelId) ??
          dropdownEntries[0] ??
          null;

        if (selectValue) {
          builder.Select('translate.model', {
            inputLabel: 'panel.translate.model',
            values: selectValues,
            value: selectValue,
            setValue: (v: { id: string; label: string }) =>
              modelId.setValue(v.id)
          });
        }

        for (const lang of TARGET_LANGUAGES) {
          builder.Checkbox(`translate.lang.${lang.id}`, {
            inputLabel: lang.label,
            value: !!checked.value[lang.id],
            setValue: (v: boolean) =>
              checked.setValue({ ...checked.value, [lang.id]: v })
          });
        }

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
            isDisabled:
              disabledReason != null ||
              !catalogReady ||
              effectiveModelId === '',
            onClick: () => {
              const block = selectedImageBlock;
              if (!block) return;
              const controller = new AbortController();
              currentController = controller;
              isRunning.setValue(true);
              void runTranslation({
                cesdk,
                modelId: effectiveModelId,
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
  signal: AbortSignal;
}

async function runTranslation(args: RunArgs): Promise<void> {
  const { cesdk, modelId, block, languages, signal } = args;
  const engine = cesdk.engine;

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

  engine.block.setState(block, { type: 'Pending', progress: 0 });

  try {
    const results = await Promise.allSettled(
      languages.map((lang) =>
        translateImage({
          image: sourceBlob,
          targetLanguageId: lang.id,
          targetLanguagePromptName: lang.promptName,
          modelId,
          signal
        }).then((blob) => ({ lang, blob }))
      )
    );

    if (signal.aborted) {
      cesdk.ui.showNotification({
        type: 'info',
        message: 'Translation cancelled.',
        duration: 'short'
      });
      return;
    }

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
