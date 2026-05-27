// TEMPORARILY DISABLED — rewritten by Task M3 of the gateway migration.
import type CreativeEditorSDK from '@cesdk/cesdk-js';

export const TRANSLATE_PANEL_ID = '//ly.img.panel/translate';
export const TRANSLATE_DOCK_ID = 'ly.img.translate.dock';

export interface SetupTranslatePanelOpts {
  gatewayUrl: string;
  apiKey: string;
}

export function setupTranslatePanel(
  _cesdk: CreativeEditorSDK,
  _opts: SetupTranslatePanelOpts
): void {
  /* stubbed — replaced in M3 */
}
