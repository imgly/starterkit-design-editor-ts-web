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
import {
  loadImageIntoScene,
  renderUploadScreen
} from './imgly/plugins/upload';

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
      void mountEditor(root, file);
    }
  });
}

async function mountEditor(
  root: HTMLDivElement,
  file: File
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
    renderOnboardingScreen(root, { reason: 'invalid' });
    return;
  }

  (window as unknown as { cesdk: CreativeEditorSDK }).cesdk = cesdk;

  await initPhotoEditor(cesdk, {
    onBack: () => navigateBackToUpload(root, cesdk)
  });

  try {
    await loadImageIntoScene(cesdk, file);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load image into editor:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not load image — try a different file.',
      duration: 'medium'
    });
    navigateBackToUpload(root, cesdk);
    return;
  }

  const imageBlock = findFirstImageBlock(cesdk.engine);
  if (imageBlock != null) cesdk.engine.block.select(imageBlock);
  cesdk.ui.openPanel(TRANSLATE_PANEL_ID);

  // Fit-to-page with a comfortable margin. createFromImage's default
  // zoom fills the canvas edge-to-edge; we want some breathing room so
  // the page edges read as a page, not as the canvas itself. Zoom after
  // openPanel so the calculation uses the narrowed canvas width (panel
  // already eats space on the right).
  const [firstPage] = cesdk.engine.scene.getPages();
  if (firstPage != null) {
    // requestAnimationFrame yields one frame so the panel's DOM has
    // settled and CE.SDK's camera knows the new viewport size before
    // zoomToBlock computes the fit.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    await cesdk.engine.scene.zoomToBlock(firstPage, { padding: 80 });
  }
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
