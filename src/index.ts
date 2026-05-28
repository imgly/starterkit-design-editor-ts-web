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
import { renderUploadScreen } from './imgly/plugins/upload';

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
      const objectURL = URL.createObjectURL(file);
      void mountEditor(root, objectURL);
    }
  });
}

async function mountEditor(
  root: HTMLDivElement,
  objectURL: string
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
    URL.revokeObjectURL(objectURL);
    renderOnboardingScreen(root, { reason: 'invalid' });
    return;
  }

  (window as unknown as { cesdk: CreativeEditorSDK }).cesdk = cesdk;

  await initPhotoEditor(cesdk, {
    onBack: () => navigateBackToUpload(root, cesdk)
  });

  try {
    await cesdk.createFromImage(objectURL);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load image into editor:', err);
    cesdk.ui.showNotification({
      type: 'error',
      message: 'Could not load image — try a different file.',
      duration: 'medium'
    });
    URL.revokeObjectURL(objectURL);
    navigateBackToUpload(root, cesdk);
    return;
  }
  URL.revokeObjectURL(objectURL);

  const imageBlock = findFirstImageBlock(cesdk.engine);
  if (imageBlock != null) cesdk.engine.block.select(imageBlock);
  cesdk.ui.openPanel(TRANSLATE_PANEL_ID);
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
