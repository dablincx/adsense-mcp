import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdSenseAuthorizationRequiredError, createAuthenticatedClient } from '../src/auth.js';

describe('lazy AdSense authorization', () => {
  const previousTokenPath = process.env.ADSENSE_MCP_TOKEN_PATH;
  const previousClientId = process.env.ADSENSE_CLIENT_ID;
  const previousClientSecret = process.env.ADSENSE_CLIENT_SECRET;
  let tempDirectory: string;

  afterEach(async () => {
    if (previousTokenPath === undefined) delete process.env.ADSENSE_MCP_TOKEN_PATH;
    else process.env.ADSENSE_MCP_TOKEN_PATH = previousTokenPath;
    if (previousClientId === undefined) delete process.env.ADSENSE_CLIENT_ID;
    else process.env.ADSENSE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.ADSENSE_CLIENT_SECRET;
    else process.env.ADSENSE_CLIENT_SECRET = previousClientSecret;
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  });

  it('returns an authorization URL when the refresh token is missing', async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'adsense-mcp-auth-'));
    process.env.ADSENSE_MCP_TOKEN_PATH = join(tempDirectory, 'missing-token.json');
    process.env.ADSENSE_CLIENT_ID = 'test-client-id';
    process.env.ADSENSE_CLIENT_SECRET = 'test-client-secret';

    await expect(createAuthenticatedClient()).rejects.toMatchObject({
      name: 'AdSenseAuthorizationRequiredError',
      authorizationUrl: expect.stringContaining('accounts.google.com'),
      message: expect.stringContaining('retry the tool')
    } satisfies Partial<AdSenseAuthorizationRequiredError>);
  });
});
