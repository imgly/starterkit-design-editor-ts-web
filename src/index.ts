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
  findFirstImageBlockOnFirstPage,
  getApiKey,
  renderOnboardingScreen,
  setConfiguredApiKey,
  TRANSLATE_PANEL_ID
} from './imgly/plugins/translate';
import type { TranslatePipeline } from './imgly/plugins/translate';
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
    onContinue: (file, pipeline) => {
      void mountEditor(root, file, pipeline);
    }
  });
}

async function mountEditor(
  root: HTMLDivElement,
  file: File,
  pipeline: TranslatePipeline
): Promise<void> {
  root.innerHTML = '';

  let cesdk: CreativeEditorSDK;
  try {
    cesdk = await CreativeEditorSDK.create(root, {
      license: import.meta.env.VITE_CESDK_LICENSE,
      userId: 'starterkit-photo-translate-user'
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize CE.SDK:', err);
    renderOnboardingScreen(root, { reason: 'invalid' });
    return;
  }

  // Debug access (remove in production).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).cesdk = cesdk;

  await initPhotoEditor(cesdk, {
    onBack: () => navigateBackToUpload(root, cesdk),
    pipeline
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

  const imageBlock = findFirstImageBlockOnFirstPage(cesdk.engine);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).cesdk;
  showCurrentScreen(root);
}

