/**
 * Magic Layers translation pipeline.
 *
 * One `imgly/image-to-scene` gateway call turns the source image into a
 * full, editable CE.SDK *scene* (the model returns a scene archive, not
 * loose blocks). Because a scene archive can only be loaded via
 * `engine.scene.loadFromArchiveURL` — which replaces the active document —
 * we make that scene the document and build the translated pages inside it:
 *
 *   - page 1 stays as the untranslated, editable "Original";
 *   - for each target language we duplicate that page, batch-translate its
 *     text blocks via the text gateway adapter, and rename it.
 *
 * Result: an editable page per language. Text translation runs per language
 * via `Promise.allSettled` (a failure in one language doesn't block the
 * others); the scene mutations are applied sequentially on the single
 * shared scene.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { getGatewayClient } from './translate';
import { translateTexts } from './translateTexts';
import { MAGIC_LAYERS_MODEL_ID, type TargetLanguage } from './providers';
import { readOriginalImageBlob } from './sourceImage';

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

  const client = getGatewayClient();
  if (!client) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'AI gateway is not configured.',
      duration: 'medium'
    });
    return;
  }

  // --- Phase 1: source image → scene archive --------------------------------
  //
  // `archiveObjectUrl` is a blob: object URL holding the scene archive.
  // The gateway hands back the archive as a `data:` URL, which the engine's
  // resource loader does not fetch — so we materialise it as a blob: URL,
  // the same scheme the rest of the app uses to feed the engine bytes.
  let archiveObjectUrl: string;
  try {
    // Send the user's *original* bytes, not a re-render. Re-exporting the
    // block to PNG re-encodes the photo losslessly, which balloons a source
    // JPEG several-fold for no quality gain. The upload path stashes the
    // original file as an engine buffer (see upload/scene.ts), so we read
    // those exact bytes straight back. Fall back to a PNG export only if the
    // fill isn't a readable engine buffer.
    //
    // Acquire the source while the block is still 'Ready': the export
    // fallback performs an internal layout update and will not return for a
    // 'Pending' block — so mark Pending only AFTER reading (the Direct
    // pipeline does the same; reversing the order deadlocks the fallback
    // before any request is sent).
    const sourceBlob =
      readOriginalImageBlob(engine, block) ??
      (await engine.block.export(block, { mimeType: 'image/png' }));
    engine.block.setState(block, { type: 'Pending', progress: 0 });

    const upload = await client.upload(
      sourceBlob,
      sourceBlob.type || 'image/png'
    );
    const sceneArchiveUrl = await client.generate(
      MAGIC_LAYERS_MODEL_ID,
      {
        image_url: upload.asset_url,
        image_urls: [upload.asset_url] // @REFACTOR: Are two attribues still needed?
      },
      {}
    );

    const archiveBlob = await (await fetch(sceneArchiveUrl)).blob();
    archiveObjectUrl = URL.createObjectURL(archiveBlob);
  } catch (err) {
    console.error('Magic Layers: image-to-scene failed:', err);
    if (engine.block.isValid(block)) {
      engine.block.setState(block, { type: 'Ready' });
    }
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Magic Layers: scene generation failed.',
      duration: 'medium'
    });
    return;
  }

  // --- Phase 2: load the scene + build a translated page per language -------
  try {
    // Replace the current (source-image) document with the model's editable
    // scene. `overrideEditorConfig: false` keeps our dock/panel setup.
    await engine.scene.loadFromArchiveURL(archiveObjectUrl, false);

    /* eslint-disable no-console */
    const allPages = engine.scene.getPages();
    console.log(
      `[Magic Layers] image-to-scene scene loaded: ${allPages.length} page(s).`
    );
    let sceneTextTotal = 0;
    allPages.forEach((page, i) => {
      const pageTextBlocks: number[] = [];
      collectTextBlocks(engine, page, pageTextBlocks);
      sceneTextTotal += pageTextBlocks.length;
      console.log(
        `  page [${i}] block #${page} "${engine.block.getName(page) || '(unnamed)'}": ` +
          `${pageTextBlocks.length} text block(s)`
      );
    });
    console.log(
      `[Magic Layers] scene total: ${allPages.length} page(s), ${sceneTextTotal} text block(s).`
    );
    /* eslint-enable no-console */

    const templatePage = allPages[0];
    if (templatePage == null) {
      throw new Error('Loaded scene has no pages.');
    }
    engine.block.setName(templatePage, 'Original');

    // Snapshot the template's text once — this is the translation source.
    // DFS order is stable, so a duplicate's text blocks line up by index.
    const templateTextBlocks: number[] = [];
    collectTextBlocks(engine, templatePage, templateTextBlocks);
    const originals = templateTextBlocks.map((tb) =>
      engine.block.getString(tb, 'text/text')
    );

    /* eslint-disable no-console */
    console.log(
      `[Magic Layers] image-to-scene returned ${templateTextBlocks.length} text block(s):`
    );
    templateTextBlocks.forEach((tb, i) => {
      console.log(
        `  [${i}] block #${tb} (${engine.block.getType(tb)}): ${JSON.stringify(
          originals[i]
        )}`
      );
    });
    /* eslint-enable no-console */

    // Translate every language in parallel (the gateway calls are the slow
    // part); apply the results to the scene sequentially below.
    const results = await Promise.allSettled(
      languages.map((lang) =>
        translateTexts({
          texts: originals,
          targetLanguagePromptName: lang.promptName
        })
      )
    );

    const failedLangs: string[] = [];
    let added = 0;
    for (let i = 0; i < results.length; i++) {
      const lang = languages[i];
      const result = results[i];
      if (result.status !== 'fulfilled') {
        console.error(`Magic Layers failed for ${lang.label}:`, result.reason);
        failedLangs.push(lang.label);
        continue;
      }

      const translated = result.value;
      // Duplicate the editable Original page (attaches to its parent, so it
      // becomes the next page) and replace its text with this language's.
      const page = engine.block.duplicate(templatePage);
      const pageTextBlocks: number[] = [];
      collectTextBlocks(engine, page, pageTextBlocks);
      const n = Math.min(pageTextBlocks.length, translated.length);
      for (let j = 0; j < n; j++) {
        engine.block.replaceText(pageTextBlocks[j], translated[j]);
      }
      engine.block.setName(page, lang.label);
      added++;
    }

    if (added > 0) engine.editor.addUndoStep();

    if (failedLangs.length === 0) {
      cesdk.ui.showNotification({
        type: 'success',
        message: `${added} translated page${added === 1 ? '' : 's'} added.`,
        duration: 'medium'
      });
    } else {
      const failed = failedLangs.join(', ');
      cesdk.ui.showNotification({
        type: added > 0 ? 'warning' : 'error',
        message:
          added > 0
            ? `${added} page${added === 1 ? '' : 's'} added; ${failed} failed.`
            : `Magic Layers translation failed for ${failed}.`,
        duration: 'long'
      });
    }
  } catch (err) {
    console.error('Magic Layers: building translated pages failed:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Magic Layers: could not build the translated scene.',
      duration: 'medium'
    });
  } finally {
    URL.revokeObjectURL(archiveObjectUrl);
    // The source block belongs to the document we replaced; only touch it
    // if the scene swap never happened (e.g. loadFromArchiveURL threw).
    if (engine.block.isValid(block)) {
      engine.block.setState(block, { type: 'Ready' });
    }
  }
}

/**
 * Depth-first collect of every text block under `root` (inclusive). Text
 * blocks can be nested inside groups, so we recurse. The traversal order is
 * deterministic, which is what lets a duplicated page's text blocks line up
 * with the template's by index.
 */
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
