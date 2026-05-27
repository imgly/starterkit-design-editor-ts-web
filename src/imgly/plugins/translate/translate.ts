/**
 * Image translation via the IMG.LY AI Gateway.
 *
 * Pure adapter: takes a source image Blob + target language + model id,
 * returns the translated image Blob. Knows nothing about CE.SDK.
 */

import {
  createGatewayClient,
  type GatewayClient
} from '@imgly/plugin-ai-generation-web';

import { bearerFromTokenResult, resolveAiToken } from './credentials';

export class TranslateError extends Error {
  constructor(
    message: string,
    public readonly language: string,
    public readonly modelId: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TranslateError';
  }
}

const PROMPT_TEMPLATE =
  'Translate every piece of visible text in this image to {language}. ' +
  'Preserve the original layout, typography, colors, and visual composition ' +
  'exactly — only replace the text content. Do not add, remove, or restyle ' +
  'anything else.';

function buildPrompt(languagePromptName: string): string {
  return PROMPT_TEMPLATE.replace('{language}', languagePromptName);
}

let client: GatewayClient | null = null;
let configuredGatewayUrl: string | null = null;

/**
 * Build the gateway client once. Re-builds if the gateway URL changes
 * (it shouldn't during a session, but we don't pin).
 */
export function configureTranslate(opts: { gatewayUrl: string }): void {
  if (configuredGatewayUrl === opts.gatewayUrl && client != null) return;
  configuredGatewayUrl = opts.gatewayUrl;
  client = createGatewayClient(opts.gatewayUrl, async () => {
    const token = await resolveAiToken();
    return bearerFromTokenResult(token);
  });
}

export interface TranslateImageArgs {
  image: Blob;
  targetLanguageId: string;
  targetLanguagePromptName: string;
  modelId: string;
}

export async function translateImage(args: TranslateImageArgs): Promise<Blob> {
  if (!client) {
    throw new TranslateError(
      'Translate is not configured. configureTranslate() must be called first.',
      args.targetLanguageId,
      args.modelId
    );
  }

  const prompt = buildPrompt(args.targetLanguagePromptName);

  try {
    // 1. Upload the source image to gateway storage; gateway returns a
    //    short-lived asset URL the model can read.
    const upload = await client.upload(
      args.image,
      args.image.type || 'image/png'
    );

    // 2. Kick off generation. The client subscribes to the SSE stream and
    //    resolves with the output URL when `generation.completed` fires.
    //
    // Image-edit models in the gateway are inconsistent about whether
    // they expect `image_url` (singular string) or `image_urls` (plural
    // array). Sending both is the cheapest polyfill until we introspect
    // the schema per-model (via `client.fetchSchema(modelId)`).
    const outputUrl = await client.generate(
      args.modelId,
      {
        prompt,
        image_url: upload.asset_url,
        image_urls: [upload.asset_url]
      },
      {}
    );

    // 3. Download the generated image into a Blob the scene can embed.
    const resp = await fetch(outputUrl);
    if (!resp.ok) {
      throw new TranslateError(
        `Failed to download translated image: ${resp.status}`,
        args.targetLanguageId,
        args.modelId
      );
    }
    return await resp.blob();
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    throw new TranslateError(
      err instanceof Error ? err.message : 'Translation failed',
      args.targetLanguageId,
      args.modelId,
      err
    );
  }
}
