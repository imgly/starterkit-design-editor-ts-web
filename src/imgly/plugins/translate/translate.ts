/**
 * Image translation via image-edit LLMs.
 *
 * Pure adapter: takes a source image Blob + target language + provider id,
 * returns the translated image Blob. Knows nothing about CE.SDK.
 */

import { fal } from '@fal-ai/client';
import { findProvider, TranslateProvider } from './providers';

export class TranslateError extends Error {
  constructor(
    message: string,
    public readonly language: string,
    public readonly providerId: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TranslateError';
  }
}

let configuredProxyUrl: string | null = null;

/**
 * Configures the fal.ai client singleton with the given proxy URL.
 * Must be called once at startup before any `translateImage` call that
 * targets a fal provider. Calling again with the same URL is a no-op.
 *
 * The fal client is a module-level singleton in `@fal-ai/client`, so
 * configuring it per-call is a race condition when multiple translations
 * run in parallel. Configure once here.
 */
export function configureTranslate(opts: { proxyUrl: string }): void {
  if (configuredProxyUrl === opts.proxyUrl) return;
  configuredProxyUrl = opts.proxyUrl;
  fal.config({
    proxyUrl: opts.proxyUrl,
    credentials: () => ''
  });
}

/**
 * One source of truth for the translation prompt. The {language} placeholder
 * is replaced with the English name of the target language.
 */
const PROMPT_TEMPLATE =
  'Translate every piece of visible text in this image to {language}. ' +
  'Preserve the original layout, typography, colors, and visual composition ' +
  'exactly — only replace the text content. Do not add, remove, or restyle ' +
  'anything else.';

function buildPrompt(languagePromptName: string): string {
  return PROMPT_TEMPLATE.replace('{language}', languagePromptName);
}

export interface TranslateImageArgs {
  image: Blob;
  targetLanguageId: string;
  targetLanguagePromptName: string;
  providerId: string;
  proxyUrl: string;
  signal?: AbortSignal;
}

export async function translateImage(
  args: TranslateImageArgs
): Promise<Blob> {
  const provider = findProvider(args.providerId);
  if (!provider) {
    throw new TranslateError(
      `Unknown provider id: ${args.providerId}`,
      args.targetLanguageId,
      args.providerId
    );
  }
  if (!args.proxyUrl) {
    throw new TranslateError(
      'AI proxy URL is not configured.',
      args.targetLanguageId,
      args.providerId
    );
  }

  const prompt = buildPrompt(args.targetLanguagePromptName);

  try {
    switch (provider.kind) {
      case 'fal':
        return await callFalProvider(provider, prompt, args);
      case 'openai':
        return await callOpenAiProvider(provider, prompt, args);
    }
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    throw new TranslateError(
      err instanceof Error ? err.message : 'Translation failed',
      args.targetLanguageId,
      args.providerId,
      err
    );
  }
}

/**
 * Sends a request to the fal.ai proxy using the official client.
 *
 * The fal client is configured with `credentials: () => ''` because the
 * proxy server is responsible for injecting auth headers — the browser
 * never sees the API key.
 */
async function callFalProvider(
  provider: TranslateProvider,
  prompt: string,
  args: TranslateImageArgs
): Promise<Blob> {
  if (configuredProxyUrl !== args.proxyUrl) {
    // Caller forgot to invoke configureTranslate at startup, or passed a
    // different proxy URL. Configure here defensively. This branch is
    // safe at startup (single-threaded init) but the race-free path is
    // to call configureTranslate() once during plugin setup.
    configureTranslate({ proxyUrl: args.proxyUrl });
  }

  // TODO: fal.storage.upload does not currently accept an AbortSignal, so
  // cancellation during the upload phase is not honored. Acceptable for a
  // demo with small images; revisit if larger uploads become common.
  const imageFile = new File([args.image], 'source.png', {
    type: args.image.type || 'image/png'
  });
  const imageUrl = await fal.storage.upload(imageFile);

  const result = (await fal.subscribe(provider.modelKey, {
    input: {
      prompt,
      image_url: imageUrl,
      image_urls: [imageUrl]
    },
    logs: false,
    abortSignal: args.signal
  })) as { data?: { images?: { url: string }[]; image?: { url: string } } };

  const outputUrl =
    result?.data?.images?.[0]?.url ?? result?.data?.image?.url;
  if (!outputUrl) {
    throw new TranslateError(
      'Provider returned no image.',
      args.targetLanguageId,
      args.providerId,
      result
    );
  }

  const resp = await fetch(outputUrl, { signal: args.signal });
  if (!resp.ok) {
    throw new TranslateError(
      `Failed to download translated image: ${resp.status}`,
      args.targetLanguageId,
      args.providerId
    );
  }
  return await resp.blob();
}

/**
 * Sends a request to the OpenAI proxy's images/edits endpoint.
 *
 * The proxy is expected to mount OpenAI under `/openai/v1/...` and inject
 * the `Authorization` header. We send multipart/form-data matching the
 * OpenAI images-edit shape.
 */
async function callOpenAiProvider(
  provider: TranslateProvider,
  prompt: string,
  args: TranslateImageArgs
): Promise<Blob> {
  const form = new FormData();
  form.append(
    'image',
    new File([args.image], 'source.png', { type: 'image/png' })
  );
  form.append('prompt', prompt);
  form.append('model', provider.modelKey);
  form.append('n', '1');
  form.append('response_format', 'b64_json');

  const url = `${args.proxyUrl.replace(/\/$/, '')}/openai/v1/images/edits`;
  const resp = await fetch(url, {
    method: 'POST',
    body: form,
    signal: args.signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new TranslateError(
      `OpenAI proxy returned ${resp.status}: ${text}`,
      args.targetLanguageId,
      args.providerId
    );
  }
  const json = (await resp.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = json.data?.[0];
  if (first?.b64_json) {
    return base64ToBlob(first.b64_json, 'image/png');
  }
  if (first?.url) {
    const dl = await fetch(first.url, { signal: args.signal });
    if (!dl.ok) {
      throw new TranslateError(
        `Failed to download translated image: ${dl.status}`,
        args.targetLanguageId,
        args.providerId
      );
    }
    return await dl.blob();
  }
  throw new TranslateError(
    'OpenAI proxy returned no image data.',
    args.targetLanguageId,
    args.providerId
  );
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
