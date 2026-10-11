import type { OAuth2Client } from 'google-auth-library';
import { ADSENSE_API_BASE } from './config.js';

export interface AdSensePage<T> {
  [key: string]: unknown;
  nextPageToken?: string;
}

export class AdSenseApi {
  constructor(private readonly auth: OAuth2Client, private readonly fetchImpl: typeof fetch = fetch) { }

  async get<T>(path: string, params: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
    const url = new URL(`${ADSENSE_API_BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers = await this.auth.getRequestHeaders(url.toString());
    const response = await this.fetchImpl(url, { headers });
    const body = await response.json() as { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(`AdSense API request failed (${response.status}): ${body.error?.message ?? response.statusText}`);
    }
    return body as T;
  }

  async listAll<T extends Record<string, unknown>>(path: string, collection: string): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<AdSensePage<T>>(path, { pageSize: 100, pageToken });
      const collectionItems = page[collection];
      if (Array.isArray(collectionItems)) items.push(...collectionItems as T[]);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }
}
