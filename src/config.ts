import { homedir } from 'node:os';
import { join } from 'node:path';

export const ADSENSE_SCOPE = 'https://www.googleapis.com/auth/adsense.readonly';
export const ADSENSE_API_BASE = 'https://adsense.googleapis.com/v2';

export function tokenFilePath(): string {
  if (process.env.ADSENSE_MCP_TOKEN_PATH) return process.env.ADSENSE_MCP_TOKEN_PATH;
  const base = process.env.APPDATA ?? join(homedir(), '.config');
  return join(base, 'adsense-mcp', 'tokens.json');
}

export function oauthClientId(): string {
  const value = process.env.ADSENSE_CLIENT_ID;
  if (!value) throw new Error('Set ADSENSE_CLIENT_ID to your Google OAuth client ID.');
  return value;
}

export function oauthClientSecret(): string {
  const value = process.env.ADSENSE_CLIENT_SECRET;
  if (!value) throw new Error('Set ADSENSE_CLIENT_SECRET to your Google OAuth client secret.');
  return value;
}
