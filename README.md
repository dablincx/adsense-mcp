# @dablincx/adsense-mcp

A local stdio MCP server for inspecting your AdSense publisher inventory: websites, ad clients, ad units, placement code, and reports. This is **AdSense for publishers**, not Google Ads campaign management.

> Early beta: the initial release is read-only. It does not create or edit AdSense sites or ad units.

## Requirements

- Node.js 20 or newer
- An AdSense account with access to the [AdSense Management API](https://developers.google.com/adsense/management)
- A Google Cloud OAuth client for a Desktop app, with the AdSense Management API enabled

## Google OAuth setup

1. In the Google Cloud project for your app, enable **AdSense Management API**.
2. Configure the OAuth consent screen for your intended audience and create an OAuth client ID of type **Desktop app**.
3. Configure `ADSENSE_CLIENT_ID` and `ADSENSE_CLIENT_SECRET` in your MCP client environment. Do not commit real OAuth credentials to `.mcp.json`.
4. Start the MCP server and call any AdSense tool. If no token exists, the tool returns an authorization URL. Open it in a browser, grant read-only AdSense access, then retry the tool. A refresh token is stored under `%APPDATA%\adsense-mcp\tokens.json` on Windows. Override this location with `ADSENSE_MCP_TOKEN_PATH` if desired.

The OAuth flow uses a local loopback callback on `127.0.0.1` and a random state value to protect the callback. Configure your Google OAuth Desktop client to permit the loopback redirect URI if prompted. The server asks only for `https://www.googleapis.com/auth/adsense.readonly`. OAuth client credentials and refresh tokens stay on your machine.

## Run

Start the MCP server directly:

```powershell
npx -y @dablincx/adsense-mcp@beta
```

Or install globally:

```powershell
npm install --global @dablincx/adsense-mcp
adsense-mcp
```

The server uses **stdio** and does not open a public network port. You don't need to run a separate login command: authentication is started on the first AdSense tool call if a token is missing. After approving access in the browser, retry the tool.

## VS Code

This repository's `.mcp.json` includes `adsense` (based on the published package). You can create a workspace specific mcp dev server by providing the same env vars as specified in .mcp.json and `npm run dev` .

An equivalent published-package entry in VS Code's `.vscode/mcp.json` format could be:

```json
{
  "servers": {
    "adsense": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@dablincx/adsense-mcp@beta"],
      "env": {
        "ADSENSE_CLIENT_ID": "...",
        "ADSENSE_CLIENT_SECRET": "..."
      }
    }
  }
}
```

Replace the client-ID and client-secret placeholders in your local MCP configuration with your own values. Keep those credentials local and do not commit them to a public repository.

## Tools

- `adsense_list_accounts` — list accessible publisher accounts.
- `adsense_list_sites` — inspect site domains, readiness state, and Auto ads status.
- `adsense_list_ad_clients` — list AdSense product clients.
- `adsense_get_ad_client_code` — retrieve site-level AdSense code for an ad client.
- `adsense_list_ad_units` — list configured ad placements and their sizes/types.
- `adsense_get_ad_unit_code` — retrieve the selected ad unit's placement code.
- `adsense_generate_report` — query report metrics/dimensions and optional date range/filter.

Use Google resource names returned by the API, such as `accounts/pub-1234567890` and `accounts/pub-1234567890/adclients/ca-pub-1234567890`. For custom reports specify `dateRange: "CUSTOM"` with both `startDate` and `endDate` in `YYYY-MM-DD` format. See Google's [report metrics and dimensions](https://developers.google.com/adsense/management/metrics-dimensions).

## License

MIT. See `LICENSE`.
