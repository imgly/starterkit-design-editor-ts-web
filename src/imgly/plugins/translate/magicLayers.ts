/**
 * Magic Layers translation pipeline.
 *
 * One `imgly/image-to-scene` gateway call produces an editable scene
 * archive. We load that archive N times — once per target language —
 * collect every text block in the loaded scene, batch-translate the
 * strings via the text gateway adapter, replace each text in place,
 * and append the result as a new page beside the source page.
 *
 * Pure orchestrator on top of `translateTexts` (gateway) and the
 * CE.SDK engine. Failure mode mirrors the direct pipeline: per-language
 * `Promise.allSettled`; a failure in any one language does not block
 * the others.
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { getGatewayClient } from './translate';
import { translateTexts } from './translateTexts';
import { MAGIC_LAYERS_MODEL_ID, type TargetLanguage } from './providers';

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

  const sourcePageId = findParentPage(engine, block);
  if (sourcePageId == null) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not find the source page.',
      duration: 'medium'
    });
    return;
  }
  const sceneParent = engine.block.getParent(sourcePageId);
  if (sceneParent == null) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Source page has no parent — cannot append translated pages.',
      duration: 'medium'
    });
    return;
  }

  const client = getGatewayClient();
  if (!client) {
    cesdk.ui.showNotification({
      type: 'error',
      message: 'AI gateway is not configured.',
      duration: 'medium'
    });
    return;
  }

  // 1. Export the selected image block as PNG and upload it.
  //
  // `archiveObjectUrl` is a blob: object URL holding the scene archive.
  // We must hand `loadFromArchiveURL` a URL the engine's resource loader
  // can fetch — and the gateway returns the archive as a `data:` URL,
  // which the engine loader does NOT handle (it silently never resolves,
  // hanging the whole pipeline). So we fetch the data URL into a Blob and
  // expose it as a blob: object URL, the same scheme the rest of the app
  // uses to feed the engine in-memory bytes (see upload/scene.ts).
  let archiveObjectUrl: string;
  try {
    // Export the source while the block is still 'Ready'. `export` performs
    // an internal update to resolve the block's layout and will not return
    // for a block in the 'Pending' state — and the only thing that clears
    // Pending is the finally below, which can't run until export returns.
    // Marking Pending before exporting therefore deadlocks (the symptom:
    // both spinners spin, no gateway request is ever sent). The Direct
    // pipeline relies on this same ordering — export first, then Pending.
    const sourceBlob = await engine.block.export(block, {
      mimeType: 'image/png'
    });
    engine.block.setState(block, { type: 'Pending', progress: 0 });
    const upload = await client.upload(sourceBlob, 'image/png');

    // 2. Single image-to-scene call. The gateway returns a `data:` URL
    //    pointing at the scene archive (zip).
    const sceneArchiveUrl = await client.generate(
      MAGIC_LAYERS_MODEL_ID,
      {
        image_url: upload.asset_url,
        image_urls: [upload.asset_url]
      },
      {}
    );

    // Convert the data: URL to a blob: object URL once and reuse it for
    // every language's loadFromArchiveURL call below.
    const archiveBlob = await (await fetch(sceneArchiveUrl)).blob();
    archiveObjectUrl = URL.createObjectURL(archiveBlob);
  } catch (err) {
    console.error('Magic Layers: image-to-scene failed:', err);
    engine.block.setState(block, { type: 'Ready' });
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Magic Layers: scene generation failed.',
      duration: 'medium'
    });
    return;
  }

  // 3. Per-language work — each language runs end-to-end independently.
  //    Each loadFromArchiveURL call gets a fresh, independent copy of the
  //    scene from the same object URL.
  try {
    const results = await Promise.allSettled(
      languages.map((lang) =>
        translateOneLanguage({
          engine,
          sceneArchiveUrl: archiveObjectUrl,
          sceneParent,
          lang
        })
      )
    );

    const failures: { lang: string; error: unknown }[] = [];
    let added = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const lang = languages[i];
      if (r.status === 'fulfilled') {
        added++;
      } else {
        console.error(`Magic Layers failed for ${lang.label}:`, r.reason);
        failures.push({ lang: lang.label, error: r.reason });
      }
    }

    if (added > 0) engine.editor.addUndoStep();

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
            : `Magic Layers translation failed for ${failedLangs}.`,
        duration: 'long'
      });
    }
  } finally {
    URL.revokeObjectURL(archiveObjectUrl);
    engine.block.setState(block, { type: 'Ready' });
  }
}

interface TranslateOneArgs {
  engine: CreativeEditorSDK['engine'];
  sceneArchiveUrl: string;
  sceneParent: number;
  lang: TargetLanguage;
}

async function translateOneLanguage(args: TranslateOneArgs): Promise<void> {
  const { engine, sceneArchiveUrl, sceneParent, lang } = args;

  // Each call gets a fresh, independent copy of the model's scene as a
  // set of detached blocks (block.loadFromArchiveURL — NOT
  // scene.loadFromArchiveURL, which would replace the live document).
  const loaded = await engine.block.loadFromArchiveURL(sceneArchiveUrl);
  if (loaded.length === 0) {
    throw new Error('loadFromArchiveURL returned no blocks');
  }

  // The model emits a scene archive, so a loaded top-level block may be a
  // scene wrapping the page rather than the page itself. Find the first
  // page among the loaded blocks or their descendants; fall back to the
  // first loaded block if the archive turns out to be page-shaped already.
  const page = findFirstPage(engine, loaded) ?? loaded[0];

  // Recursively collect every text block under the loaded page.
  const textBlocks: number[] = [];
  collectTextBlocks(engine, page, textBlocks);

  if (textBlocks.length > 0) {
    const originals = textBlocks.map((tb) =>
      engine.block.getString(tb, 'text/text')
    );
    const translated = await translateTexts({
      texts: originals,
      targetLanguagePromptName: lang.promptName
    });
    // Length match is already enforced by translateTexts.
    for (let i = 0; i < textBlocks.length; i++) {
      engine.block.replaceText(textBlocks[i], translated[i]);
    }
  }

  engine.block.setName(page, lang.label);
  engine.block.appendChild(sceneParent, page);
}

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

/**
 * Depth-first search for the first `page` block among the given roots and
 * their descendants. Returns null if no page is found (e.g. the archive
 * is a bare graphic), letting the caller fall back to the first root.
 */
function findFirstPage(
  engine: CreativeEditorSDK['engine'],
  roots: number[]
): number | null {
  for (const root of roots) {
    if (engine.block.getType(root) === '//ly.img.ubq/page') return root;
    const inChildren = findFirstPage(engine, engine.block.getChildren(root));
    if (inChildren != null) return inChildren;
  }
  return null;
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
