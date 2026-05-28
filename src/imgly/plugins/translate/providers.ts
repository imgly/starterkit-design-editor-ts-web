/**
 * Translate feature — provider + language constants.
 *
 * The Translate panel offers a fixed allow-list of three image-edit models
 * (Nano Banana Pro, GPT Image 2, Seedream 4.5). No live catalog fetch.
 */

import { GatewayProvider as ImageGatewayProvider } from '@imgly/plugin-ai-image-generation-web/gateway';

export const DEFAULT_GATEWAY_URL = 'https://gateway.img.ly';

export interface TargetLanguage {
  id: string;
  label: string;
  promptName: string;
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { id: 'de', label: 'German', promptName: 'German' },
  { id: 'en', label: 'English', promptName: 'English' },
  { id: 'es', label: 'Spanish', promptName: 'Spanish' },
  { id: 'ru', label: 'Russian', promptName: 'Russian' },
  { id: 'zh', label: 'Chinese (Simplified)', promptName: 'Simplified Chinese' }
];

export interface TranslateModel {
  /** Gateway model id (passed to `client.generate`). */
  id: string;
  /** Label shown in the dropdown. */
  label: string;
}

/**
 * Fixed allow-list of image-edit models offered by the Translate panel.
 * The order here is the dropdown order; the first entry is the default
 * selection.
 */
export const TRANSLATE_MODELS: readonly TranslateModel[] = [
  { id: 'google/nano-banana-pro-edit', label: 'Nano Banana Pro' },
  { id: 'openai/gpt-image-2-edit', label: 'GPT Image 2' },
  { id: 'bytedance/seedream-4.5-edit', label: 'Seedream 4.5' }
] as const;

/**
 * @deprecated Removed in Task 8. Retained temporarily so the old AI image
 * plugin wiring in `src/imgly/index.ts` keeps building until that file is
 * rewritten.
 */
export const CURATED_IMAGE_EDIT_MODEL_IDS = ['bfl/flux-2-edit'];

/**
 * @deprecated Removed in Task 8 along with the AI image plugin call.
 */
export function instantiateGatewayProviders(
  modelIds: string[],
  gatewayUrl: string
) {
  return modelIds.map((id) => ImageGatewayProvider(id, { gatewayUrl }));
}
