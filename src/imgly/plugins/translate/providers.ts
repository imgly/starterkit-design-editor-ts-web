/**
 * Translate feature — provider + language constants.
 *
 * After the gateway migration this module no longer hard-codes a list of
 * provider/model pairs: the dropdown is populated dynamically from the
 * gateway catalog (see `catalog.ts`). What stays here is the gateway URL
 * default, the target-language list, and a small helper for instantiating
 * `ImageGatewayProvider` instances from a list of model ids.
 */

import { GatewayProvider as ImageGatewayProvider } from '@imgly/plugin-ai-image-generation-web/gateway';

export const DEFAULT_GATEWAY_URL = 'https://gateway.img.ly';

/** Target languages the Translate panel offers. */
export interface TargetLanguage {
  /** Stable id (also the locale tag we hand to the LLM). */
  id: string;
  /** Label shown in the checkbox + the new page's name. */
  label: string;
  /** English name of the language used inside the prompt. */
  promptName: string;
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { id: 'de', label: 'German', promptName: 'German' },
  { id: 'en', label: 'English', promptName: 'English' },
  { id: 'es', label: 'Spanish', promptName: 'Spanish' },
  { id: 'ru', label: 'Russian', promptName: 'Russian' },
  { id: 'zh', label: 'Chinese (Simplified)', promptName: 'Simplified Chinese' }
];

/**
 * Curated fallback model ids for the official AI plugin's image-edit dock
 * entry. The Translate panel itself uses the live gateway catalog instead
 * — this list is only what the AI plugin registers at startup so its
 * dropdown is non-empty before any UI is opened.
 */
export const CURATED_IMAGE_EDIT_MODEL_IDS = ['bfl/flux-2-edit'];

/**
 * Build one `ImageGatewayProvider` per model id. Used in
 * `src/imgly/index.ts` to register the AI plugin's `image2image`
 * providers (the bonus regular image-edit dock entry).
 */
export function instantiateGatewayProviders(
  modelIds: string[],
  gatewayUrl: string
) {
  return modelIds.map((id) => ImageGatewayProvider(id, { gatewayUrl }));
}
