/**
 * Translate feature — provider + language constants.
 *
 * The Translate panel offers a fixed allow-list of three image-edit models
 * (Nano Banana Pro, GPT Image 2, Seedream 4.5). No live catalog fetch.
 */

export const DEFAULT_GATEWAY_URL = 'https://gateway.img.ly';

export interface TargetLanguage {
  id: string;
  label: string;
  promptName: string;
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { id: 'de', label: 'German', promptName: 'German' },
  { id: 'en', label: 'English', promptName: 'English' },
  { id: 'fr', label: 'French', promptName: 'French' },
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
 * Gateway model id for the Magic Layers image-to-scene pipeline.
 * Takes a source image + returns a scene archive (zip) with editable
 * layers — including text blocks — that the host scene loads via
 * `engine.block.loadFromArchiveURL`.
 */
export const MAGIC_LAYERS_MODEL_ID = 'imgly/image-to-scene';

export type TranslatePipeline = 'direct' | 'magic-layers';

export interface TranslatePipelineSpec {
  id: TranslatePipeline;
  label: string;
  description: string;
}

/**
 * The two translation pipelines surfaced on the upload screen.
 *
 * - 'direct' sends the source image to an image-edit model once per
 *   language, returning a flat translated image (text baked in).
 * - 'magic-layers' sends the source image to the `imgly/image-to-scene`
 *   model once, then batch-translates the returned scene's text blocks
 *   per language — yielding editable text layers in each translated page.
 */
export const TRANSLATE_PIPELINES: readonly TranslatePipelineSpec[] = [
  {
    id: 'direct',
    label: 'Direct',
    description: 'Flat image with higher fidelity.'
  },
  {
    id: 'magic-layers',
    label: 'IMG.LY Magic Layers',
    description:
      'Editable text, faster & cheaper for more than 2 translations.'
  }
] as const;

export const DEFAULT_TRANSLATE_PIPELINE: TranslatePipeline = 'direct';
