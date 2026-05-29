/**
 * Batch text translation via the IMG.LY AI Gateway.
 *
 * Pure adapter: takes an array of strings + target language, returns
 * an array of translated strings via `openai/gpt-5.4-mini`. Throws on
 * any structural drift in the response (non-JSON, wrong length, non-
 * string entries) so the call site can mark the language as failed.
 *
 * The model is asked to translate the whole array in one shot. Cross-
 * block context yields more consistent terminology and register than N
 * independent per-block calls — see the Magic Layers spec for rationale.
 */

import { getGatewayClient } from './translate';

const TEXT_MODEL_ID = 'openai/gpt-5.4-mini';

const SYSTEM_PROMPT =
  'You are a translator. Translate every item in the JSON array below into ' +
  '{language}. Preserve tone and register; use consistent terminology across ' +
  'items (they are pieces of one design). Respond with ONLY a JSON array of ' +
  'strings, in the same order and same length as the input. Do not wrap the ' +
  'array in markdown or add commentary.';

export interface TranslateTextsArgs {
  texts: string[];
  /** Human-readable language name fed to the prompt (e.g. "German"). */
  targetLanguagePromptName: string;
}

export async function translateTexts(
  args: TranslateTextsArgs
): Promise<string[]> {
  if (args.texts.length === 0) return [];

  const client = getGatewayClient();
  if (!client) {
    throw new Error('translateTexts: gateway client not configured');
  }

  const prompt =
    SYSTEM_PROMPT.replace('{language}', args.targetLanguagePromptName) +
    '\n\nInput:\n' +
    JSON.stringify(args.texts);

  // The gateway's text endpoint (/v1/responses) expects a chat-style
  // `messages` array for `openai/gpt-5.4-mini` — sending `{ prompt }`
  // returns 400 "messages is required".
  //
  // Drain the stream — generateStream returns the final accumulated
  // text as the AsyncGenerator's return value. `for await…of` only
  // sees intermediate yields, so we iterate manually.
  const stream = client.generateStream(
    TEXT_MODEL_ID,
    { messages: [{ role: 'user', content: prompt }] },
    {}
  );
  let final = '';
  while (true) {
    const { value, done } = await stream.next();
    if (done) {
      final = value;
      break;
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(final);
  } catch {
    throw new Error(
      `translateTexts: model returned non-JSON (${final.slice(0, 80)}…)`
    );
  }
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
    throw new Error(
      `translateTexts: model returned non-string-array: ${final.slice(0, 80)}…`
    );
  }
  if (parsed.length !== args.texts.length) {
    throw new Error(
      `translateTexts: expected ${args.texts.length} items, got ${parsed.length}`
    );
  }
  return parsed as string[];
}
