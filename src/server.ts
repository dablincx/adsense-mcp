import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { AdSenseAuthorizationRequiredError, createAuthenticatedClient } from './auth.js';
import { AdSenseApi } from './adsense-api.js';

const accountNameSchema = z.string().regex(/^accounts\/[^/]+$/, 'Use an account resource name such as accounts/pub-1234567890.');
const adClientNameSchema = z.string().regex(/^accounts\/pub-\d+\/adclients\/[\w-]+$/, 'Use an AdSense ad client resource name returned by the API.');
const adUnitNameSchema = z.string().regex(/^accounts\/pub-\d+\/adclients\/[\w-]+\/adunits\/[\w-]+$/, 'Use an AdSense ad unit resource name returned by the API.');
const accountSchema = z.object({ account: accountNameSchema });

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

async function runAuthorized<T>(action: (api: AdSenseApi) => Promise<T>) {
  try {
    const api = new AdSenseApi(await createAuthenticatedClient());
    return textResult(await action(api));
  } catch (error) {
    if (error instanceof AdSenseAuthorizationRequiredError) {
      return {
        content: [{ type: 'text' as const, text: error.message }],
        isError: true
      };
    }
    return {
      content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
      isError: true
    };
  }
}

export async function startServer(): Promise<void> {
  const instructions = 'This server accesses the user’s own AdSense publisher account and site inventory. Google OAuth authorization is required before any AdSense data can be accessed. If a tool reports that authorization is required, present its Google authorization URL to the user, have them open it and approve read-only AdSense access, then retry the tool. Never attempt to authenticate on the user’s behalf or ask them to share tokens or secrets in chat.';
  const mcpServer = new McpServer(
    { name: 'adsense-mcp', version: '0.1.0-beta.1' },
    { instructions }
  );

  mcpServer.registerTool('adsense_list_accounts', {
    description: 'List AdSense accounts available to the authenticated Google user.',
    inputSchema: z.object({})
  }, async () => runAuthorized((api) => api.listAll('accounts', 'accounts')));

  mcpServer.registerTool('adsense_list_sites', {
    description: 'List websites in an AdSense account, including readiness and Auto ads status.',
    inputSchema: accountSchema
  }, async ({ account }) => runAuthorized((api) => api.listAll(`${account}/sites`, 'sites')));

  mcpServer.registerTool('adsense_list_ad_clients', {
    description: 'List AdSense ad clients associated with an account.',
    inputSchema: accountSchema
  }, async ({ account }) => runAuthorized((api) => api.listAll(`${account}/adclients`, 'adClients')));

  mcpServer.registerTool('adsense_get_ad_client_code', {
    description: 'Get the AdSense site-level code snippet (previously known as Auto ads code) for an AdSense for Content ad client.',
    inputSchema: z.object({ account: accountNameSchema, adClient: adClientNameSchema })
  }, async ({ account, adClient }) => runAuthorized(async (api) => {
    if (!adClient.startsWith(`${account}/adclients/`)) {
      throw new Error('The adClient resource must belong to the supplied account.');
    }
    const clientId = adClient.split('/').at(-1);
    return api.get(`${account}/adclients/${clientId}/adcode`);
  }));

  mcpServer.registerTool('adsense_list_ad_units', {
    description: 'List configured AdSense ad units (the placements available to put on your websites).',
    inputSchema: z.object({
      account: accountSchema.shape.account,
      adClient: adClientNameSchema
    })
  }, async ({ account, adClient }) => runAuthorized(async (api) => {
    if (!adClient.startsWith(`${account}/adclients/`)) {
      throw new Error('The adClient resource must belong to the supplied account.');
    }
    const accountName = account.replace(/\/$/, '');
    const clientName = adClient.split('/').at(-1);
    return api.listAll(`${accountName}/adclients/${clientName}/adunits`, 'adUnits');
  }));

  mcpServer.registerTool('adsense_get_ad_unit_code', {
    description: 'Get the HTML/JavaScript ad code for a selected AdSense ad unit.',
    inputSchema: z.object({
      account: accountSchema.shape.account,
      adClient: adClientNameSchema,
      adUnit: adUnitNameSchema
    })
  }, async ({ account, adClient, adUnit }) => runAuthorized(async (api) => {
    if (!adClient.startsWith(`${account}/adclients/`) || !adUnit.startsWith(`${adClient}/adunits/`)) {
      throw new Error('The adClient and adUnit resources must belong to the supplied account and each other.');
    }
    const accountName = account.replace(/\/$/, '');
    const clientName = adClient.split('/').at(-1);
    const unitName = adUnit.split('/').at(-1);
    return api.get(`${accountName}/adclients/${clientName}/adunits/${unitName}/adcode`);
  }));

  mcpServer.registerTool('adsense_generate_report', {
    description: 'Generate an AdSense report for an account. Use valid AdSense API dimensions/metrics such as DATE and ESTIMATED_EARNINGS.',
    inputSchema: z.object({
      account: accountSchema.shape.account,
      metrics: z.array(z.string()).min(1),
      dimensions: z.array(z.string()).optional(),
      dateRange: z.enum(['TODAY', 'YESTERDAY', 'MONTH_TO_DATE', 'YEAR_TO_DATE', 'LAST_7_DAYS', 'LAST_30_DAYS', 'CUSTOM']).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      filters: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(100000).optional()
    })
  }, async ({ account, metrics, dimensions, dateRange, startDate, endDate, filters, limit }) => runAuthorized(async (api) => {
    const resolvedDateRange = dateRange ?? (startDate || endDate ? 'CUSTOM' : 'YESTERDAY');
    if (resolvedDateRange === 'CUSTOM' && (!startDate || !endDate)) {
      throw new Error('CUSTOM reports require both startDate and endDate in YYYY-MM-DD format.');
    }
    if (resolvedDateRange !== 'CUSTOM' && (startDate || endDate)) {
      throw new Error('startDate and endDate can only be used with dateRange CUSTOM.');
    }
    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new Error('Provide both startDate and endDate together.');
    }
    const startMillis = startDate ? Date.parse(`${startDate}T00:00:00Z`) : undefined;
    const endMillis = endDate ? Date.parse(`${endDate}T00:00:00Z`) : undefined;
    if (startDate && endDate && (startMillis! > endMillis! || Number.isNaN(startMillis) || Number.isNaN(endMillis) || new Date(startMillis!).toISOString().slice(0, 10) !== startDate || new Date(endMillis!).toISOString().slice(0, 10) !== endDate)) {
      throw new Error('Provide valid dates with startDate on or before endDate.');
    }
    const query: Record<string, string | number | string[] | undefined> = {
      dateRange: resolvedDateRange,
      limit,
      metrics,
      dimensions,
      filters
    };
    if (startDate) {
      const [year, month, day] = startDate.split('-');
      query['startDate.year'] = Number(year);
      query['startDate.month'] = Number(month);
      query['startDate.day'] = Number(day);
    }
    if (endDate) {
      const [year, month, day] = endDate.split('-');
      query['endDate.year'] = Number(year);
      query['endDate.month'] = Number(month);
      query['endDate.day'] = Number(day);
    }
    return api.get(`${account}/reports:generate`, query);
  }));

  await mcpServer.connect(new StdioServerTransport());
}
