/**
 * Dock Configuration — Translate + Uploads only.
 *
 * The Translate entry follows the same structured pattern the photo
 * starter kit uses for Crop/Filter/etc: it borrows the
 * `ly.img.assetLibrary.dock` shell with `entries: []`, then provides its
 * own `isSelected` predicate (reactive — re-evaluated by CE.SDK on every
 * dock render) and `onClick` that toggles the Translate panel.
 *
 * Using `isSelected: () => …` instead of registering a custom
 * `builder.Button` is what makes the "active" border de-activate when the
 * user clicks another dock entry: CE.SDK closes the previous panel,
 * isSelected re-evaluates to false, and the button repaints.
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/dock-cb916c/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  TRANSLATE_ICON_ID,
  TRANSLATE_PANEL_ID
} from '../../src/imgly/plugins/translate';

export function setupDock(cesdk: CreativeEditorSDK): void {
  const { engine, ui } = cesdk;

  engine.editor.setSetting('dock/hideLabels', false);
  engine.editor.setSetting('dock/iconSize', 'large');

  ui.setComponentOrder({ in: 'ly.img.dock' }, [
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.translate',
      icon: TRANSLATE_ICON_ID,
      label: 'libraries.ly.img.translate.label',
      entries: [],
      isSelected: () => ui.isPanelOpen(TRANSLATE_PANEL_ID),
      onClick: () => {
        if (ui.isPanelOpen(TRANSLATE_PANEL_ID)) {
          ui.closePanel(TRANSLATE_PANEL_ID);
          return;
        }
        ui.closePanel('*');
        ui.openPanel(TRANSLATE_PANEL_ID);
      }
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.upload',
      icon: '@imgly/Upload',
      label: 'libraries.ly.img.upload.label',
      entries: ['ly.img.image.upload']
    }
  ]);
}
