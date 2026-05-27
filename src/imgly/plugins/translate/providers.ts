/**
 * Shared list of image-edit providers available through the IMG.LY gateway.
 *
 * Used in two places:
 *
 * 1. Mapped into provider instances for the official
 *    `@imgly/plugin-ai-image-generation-web` plugin so the editor gets a
 *    regular AI image-edit dock entry "for free".
 * 2. Rendered into the model dropdown of our custom Translate panel.
 *
 * Add a new model here and it shows up in both places.
 */

import FalAiImage from '@imgly/plugin-ai-image-generation-web/fal-ai';
import OpenAiImage from '@imgly/plugin-ai-image-generation-web/open-ai';

export type TranslateProviderKind = 'fal' | 'openai';

export interface TranslateProvider {
  /** Stable id used in dropdown state and dispatch. */
  id: string;
  /** Label shown in the dropdown. */
  label: string;
  /** Which adapter (`translate.ts`) handles it. */
  kind: TranslateProviderKind;
  /** Model identifier the gateway expects (e.g. fal model key). */
  modelKey: string;
}

/**
 * Empty proxy URL means "not configured". Set `VITE_IMGLY_AI_PROXY_URL` in
 * `.env` to override. The default is empty so the missing-URL toast path
 * is exercised when the developer forgets to configure it.
 */
export const DEFAULT_PROXY_URL = '';

export const TRANSLATE_PROVIDERS: TranslateProvider[] = [
  {
    id: 'fal-ai/nano-banana/edit',
    label: 'Nano Banana Edit',
    kind: 'fal',
    modelKey: 'fal-ai/nano-banana/edit'
  },
  {
    id: 'fal-ai/gemini-25-flash-image/edit',
    label: 'Gemini 2.5 Flash Image Edit',
    kind: 'fal',
    modelKey: 'fal-ai/gemini-25-flash-image/edit'
  },
  {
    id: 'fal-ai/gemini-flash-edit',
    label: 'Gemini Flash Edit',
    kind: 'fal',
    modelKey: 'fal-ai/gemini-flash-edit'
  },
  {
    id: 'fal-ai/flux-pro/kontext/edit',
    label: 'Flux Pro Kontext Edit',
    kind: 'fal',
    modelKey: 'fal-ai/flux-pro/kontext/edit'
  },
  {
    id: 'fal-ai/qwen-image-edit',
    label: 'Qwen Image Edit',
    kind: 'fal',
    modelKey: 'fal-ai/qwen-image-edit'
  },
  {
    id: 'fal-ai/bytedance/seedream/v4/edit',
    label: 'Seedream V4 Edit',
    kind: 'fal',
    modelKey: 'fal-ai/bytedance/seedream/v4/edit'
  },
  {
    id: 'openai/gpt-image-1/edit',
    label: 'GPT Image 1',
    kind: 'openai',
    modelKey: 'gpt-image-1'
  }
];

export const DEFAULT_PROVIDER_ID = 'fal-ai/nano-banana/edit';

export function findProvider(id: string): TranslateProvider | undefined {
  return TRANSLATE_PROVIDERS.find((p) => p.id === id);
}

/**
 * Maps a `TranslateProvider` row to the instance shape expected by
 * `@imgly/plugin-ai-image-generation-web`'s `image2image` option.
 *
 * The constructor names exported by the package match the labels we use
 * in the dropdown; the mapping below keeps that linkage in one place.
 */
export function toAiPluginProvider(
  provider: TranslateProvider,
  proxyUrl: string
) {
  switch (provider.id) {
    case 'fal-ai/nano-banana/edit':
      return FalAiImage.NanoBananaEdit({ proxyUrl });
    case 'fal-ai/gemini-25-flash-image/edit':
      return FalAiImage.Gemini25FlashImageEdit({ proxyUrl });
    case 'fal-ai/gemini-flash-edit':
      return FalAiImage.GeminiFlashEdit({ proxyUrl });
    case 'fal-ai/flux-pro/kontext/edit':
      return FalAiImage.FluxProKontextEdit({ proxyUrl });
    case 'fal-ai/qwen-image-edit':
      return FalAiImage.QwenImageEdit({ proxyUrl });
    case 'fal-ai/bytedance/seedream/v4/edit':
      return FalAiImage.SeedreamV4Edit({ proxyUrl });
    case 'openai/gpt-image-1/edit':
      return OpenAiImage.GptImage1.Image2Image({ proxyUrl });
    default:
      throw new Error(`Unknown translate provider id: ${provider.id}`);
  }
}

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
