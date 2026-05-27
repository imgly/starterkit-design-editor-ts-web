/**
 * Fetches the gateway's model catalog and filters to image-edit models.
 *
 * Hits `GET ${gatewayUrl}/v1/models?groupBy=capability`. The response is
 * a JSON object whose `image2image` key (if present) is an array of
 * `{ id, name? }` entries.
 */

import {
  bearerFromTokenResult,
  resolveAiToken
} from './credentials';

export interface TranslateCatalogEntry {
  /** Gateway model id (passed to `client.generate`). */
  id: string;
  /** Display label. Falls back to `id` if the gateway has no name. */
  label: string;
}

interface RawModelEntry {
  id?: string;
  name?: string;
}

export async function fetchImageEditCatalog(
  gatewayUrl: string,
  signal?: AbortSignal
): Promise<TranslateCatalogEntry[]> {
  const token = await resolveAiToken();
  const bearer = bearerFromTokenResult(token);

  const url = `${gatewayUrl.replace(/\/$/, '')}/v1/models?groupBy=capability`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal
  });
  if (!res.ok) {
    throw new Error(
      `Gateway returned ${res.status} ${res.statusText} for /v1/models.`
    );
  }
  const json = (await res.json()) as Record<string, RawModelEntry[]>;
  const raw = json['image2image'] ?? [];
  return raw
    .filter((m): m is RawModelEntry & { id: string } => typeof m.id === 'string')
    .map((m) => ({ id: m.id, label: m.name ?? m.id }));
}
