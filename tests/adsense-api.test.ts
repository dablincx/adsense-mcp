import { describe, expect, it, vi } from 'vitest';
import { AdSenseApi } from '../src/adsense-api.js';

function mockAuth() {
  return { getRequestHeaders: vi.fn(async () => ({ Authorization: 'Bearer test-token' })) } as never;
}

describe('AdSenseApi', () => {
  it('encodes repeated query parameters for report dimensions and metrics', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    const api = new AdSenseApi(mockAuth(), fetchMock as typeof fetch);

    await api.get('accounts/pub-123/reports:generate', {
      metrics: ['ESTIMATED_EARNINGS', 'CLICKS'],
      dimensions: ['DATE']
    });

    const requestUrl = new URL(fetchMock.mock.calls[0]![0] as string | URL);
    expect(requestUrl.searchParams.getAll('metrics')).toEqual(['ESTIMATED_EARNINGS', 'CLICKS']);
    expect(requestUrl.searchParams.getAll('dimensions')).toEqual(['DATE']);
  });

  it('follows all pages when listing a collection', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{ name: 'accounts/pub-one' }], nextPageToken: 'next' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{ name: 'accounts/pub-two' }] })));
    const api = new AdSenseApi(mockAuth(), fetchMock as typeof fetch);

    const accounts = await api.listAll<{ name: string }>('accounts', 'accounts');

    expect(accounts.map(({ name }) => name)).toEqual(['accounts/pub-one', 'accounts/pub-two']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1]![0] as string | URL).searchParams.get('pageToken')).toBe('next');
  });

  it('surfaces useful errors from the AdSense API', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message: 'Permission denied' } }), { status: 403 }));
    const api = new AdSenseApi(mockAuth(), fetchMock as typeof fetch);

    await expect(api.get('accounts')).rejects.toThrow('AdSense API request failed (403): Permission denied');
  });
});
