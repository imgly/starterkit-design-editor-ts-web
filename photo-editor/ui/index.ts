/**
 * UI Configuration - Orchestrates All UI Setup
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/overview-41101a/
 */

import type CreativeEditorSDK from '@cesdk/cesdk-js';

import type { PhotoEditorConfigOpts } from '../plugin';
import { setupCanvas } from './canvas';
import { setupComponents } from './components';
import { setupDock } from './dock';
import { setupInspectorBar } from './inspectorBar';
import { setupNavigationBar } from './navigationBar';
import { setupPanels } from './panel';

export function setupUI(
  cesdk: CreativeEditorSDK,
  opts: PhotoEditorConfigOpts
): void {
  setupPanels(cesdk);
  setupComponents(cesdk);
  setupNavigationBar(cesdk, opts);
  setupCanvas(cesdk);
  setupInspectorBar(cesdk);
  setupDock(cesdk);
}

export {
  setupCanvas,
  setupComponents,
  setupDock,
  setupInspectorBar,
  setupNavigationBar,
  setupPanels
};
