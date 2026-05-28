/**
 * Dock Configuration — Translate + Uploads only.
 *
 * The Translate entry is registered by the Translate plugin
 * (TRANSLATE_DOCK_ID); we just place it. Uploads uses CE.SDK's
 * built-in asset-library dock component, pointed at the
 * `ly.img.image.upload` source.
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/dock-cb916c/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import { TRANSLATE_DOCK_ID } from '../../src/imgly/plugins/translate';

export function setupDock(cesdk: CreativeEditorSDK): void {
  const { engine, ui } = cesdk;

  engine.editor.setSetting('dock/hideLabels', false);
  engine.editor.setSetting('dock/iconSize', 'large');

  ui.setComponentOrder({ in: 'ly.img.dock' }, [
    TRANSLATE_DOCK_ID,
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.upload',
      icon: '@imgly/Upload',
      label: 'libraries.ly.img.upload.label',
      entries: ['ly.img.image.upload']
    }
  ]);
}
