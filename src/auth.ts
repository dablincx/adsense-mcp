import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { ADSENSE_SCOPE, oauthClientId, oauthClientSecret, tokenFilePath } from './config.js';

interface StoredCredentials {
  refresh_token: string;
}

interface PendingAuthorization {
  url: string;
  server: Server;
  state: string;
}

export class AdSenseAuthorizationRequiredError extends Error {
  constructor(readonly authorizationUrl: string) {
    super(`AdSense authorization is required. No OAuth token has been generated yet. Open this URL, authorize read-only access, then retry the tool: ${authorizationUrl}`);
    this.name = 'AdSenseAuthorizationRequiredError';
  }
}

let pendingAuthorization: PendingAuthorization | undefined;
let startingAuthorization: Promise<PendingAuthorization> | undefined;

async function startAuthorization(): Promise<PendingAuthorization> {
  if (pendingAuthorization) return pendingAuthorization;
  if (startingAuthorization) return startingAuthorization;

  startingAuthorization = (async () => {
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });

      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not start the local OAuth callback server.');

      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const client = new OAuth2Client({
        clientId: oauthClientId(),
        clientSecret: oauthClientSecret(),
        redirectUri
      });
      const state = randomBytes(32).toString('hex');
      const url = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [ADSENSE_SCOPE],
        redirect_uri: redirectUri,
        state
      });

      const authorization: PendingAuthorization = { url, server, state };
      pendingAuthorization = authorization;
      server.on('request', (request, response) => {
        void handleOAuthCallback(request.url ?? '/', redirectUri, authorization, client, response);
      });
      console.error(`AdSense authentication required. Authorize here: ${url}`);
      return authorization;
    } catch (error) {
      server.close();
      throw error;
    }
  })();

  try {
    return await startingAuthorization;
  } finally {
    startingAuthorization = undefined;
  }
}

async function handleOAuthCallback(
  requestPath: string,
  redirectUri: string,
  authorization: PendingAuthorization,
  client: OAuth2Client,
  response: ServerResponse
): Promise<void> {
  const url = new URL(requestPath, redirectUri);
  if (url.pathname !== '/oauth2callback') {
    response.writeHead(404).end('Not found.');
    return;
  }

  const expectedState = Buffer.from(authorization.state);
  const receivedState = Buffer.from(url.searchParams.get('state') ?? '');
  if (receivedState.length !== expectedState.length || !timingSafeEqual(receivedState, expectedState)) {
    response.writeHead(400).end('OAuth state validation failed. Retry an AdSense tool to create a new authorization request.');
    return;
  }

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('AdSense authorization was not granted. Return to your AI assistant and retry an AdSense tool.');
    console.error(`AdSense OAuth authorization was not granted: ${oauthError}`);
    pendingAuthorization = undefined;
    authorization.server.close();
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    response.writeHead(400).end('OAuth authorization code was not provided.');
    return;
  }

  try {
    const result = await client.getToken({ code, redirect_uri: redirectUri });
    if (!result.tokens.refresh_token) {
      throw new Error('Google did not return a refresh token. Revoke this app in your Google Account permissions, then retry authorization.');
    }
    const path = tokenFilePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ refresh_token: result.tokens.refresh_token } satisfies StoredCredentials, null, 2), { mode: 0o600 });
    if (process.platform !== 'win32') await chmod(path, 0o600);
    response.writeHead(200, { 'content-type': 'text/plain' }).end('AdSense authorization complete. Return to your AI assistant and retry the tool. You may close this window.');
    console.error(`AdSense credentials saved to ${path}`);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain' }).end('AdSense authorization failed. Check the MCP server output and retry.');
    console.error(error instanceof Error ? error.message : error);
  } finally {
    pendingAuthorization = undefined;
    authorization.server.close();
  }
}

export async function createAuthenticatedClient(): Promise<OAuth2Client> {
  const client = new OAuth2Client({ clientId: oauthClientId(), clientSecret: oauthClientSecret() });
  let tokenContents: string;
  try {
    tokenContents = await readFile(tokenFilePath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const authorization = await startAuthorization();
    throw new AdSenseAuthorizationRequiredError(authorization.url);
  }

  let credentials: StoredCredentials;
  try {
    credentials = JSON.parse(tokenContents) as StoredCredentials;
  } catch {
    throw new Error('The saved AdSense token file is invalid JSON. Remove it and retry authorization.');
  }
  if (!credentials.refresh_token) throw new Error('Stored OAuth token is missing a refresh token. Remove the token file and retry authorization.');
  client.setCredentials(credentials);
  return client;
}

export async function login(): Promise<void> {
  const authorization = await startAuthorization();
  console.error('Open this URL to authorize read-only AdSense access:');
  console.error(authorization.url);
  console.error('After authorizing, retry an AdSense tool.');
}
