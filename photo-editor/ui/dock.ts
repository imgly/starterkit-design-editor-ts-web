/**
 * Dock Configuration — Translate + Uploads only.
 *
 * Both entries are structured `ly.img.assetLibrary.dock` items with their
 * own `isSelected` predicate (reactive — re-evaluated by CE.SDK on every
 * dock render) and `onClick` that closes other panels before opening
 * its own. This matches the photo starter kit's Crop / Filter / Text /
 * Shapes / Stickers pattern, and ensures exactly one dock item is active
 * at a time.
 *
 * The default `ly.img.assetLibrary.dock` behavior (used when you only
 * supply `entries`) opens the asset library panel without closing other
 * open panels, which lets two dock entries appear active at once.
 * Custom onClick + isSelected fixes that.
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/customization/dock-cb916c/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import {
  TRANSLATE_ICON_ID,
  TRANSLATE_PANEL_ID
} from '../../src/imgly/plugins/translate';

const ASSET_LIBRARY_PANEL_ID = '//ly.img.panel/assetLibrary';

/**
 * Payload that identifies the Uploads asset-library panel.
 *
 * `ly.img.upload` is the **asset library entry id** (UI layer) that
 * UploadAssetSources binds the `ly.img.image.upload` source to. Using
 * the source id here would render an empty panel without the "Add"
 * button — the asset library only renders upload controls for entries
 * it recognises as upload-enabled.
 */
const UPLOAD_PANEL_PAYLOAD = {
  entries: ['ly.img.upload'],
  title: 'libraries.ly.img.upload.label'
};

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
      entries: UPLOAD_PANEL_PAYLOAD.entries,
      isSelected: () =>
        ui.isPanelOpen(ASSET_LIBRARY_PANEL_ID, {
          payload: UPLOAD_PANEL_PAYLOAD
        }),
      onClick: () => {
        if (
          ui.isPanelOpen(ASSET_LIBRARY_PANEL_ID, {
            payload: UPLOAD_PANEL_PAYLOAD
          })
        ) {
          ui.closePanel(ASSET_LIBRARY_PANEL_ID);
          return;
        }
        ui.closePanel('*');
        ui.openPanel(ASSET_LIBRARY_PANEL_ID, {
          payload: UPLOAD_PANEL_PAYLOAD
        });
      }
    }
  ]);
}
