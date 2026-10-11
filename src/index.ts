#!/usr/bin/env node
import { Command } from 'commander';
import { login } from './auth.js';
import { startServer } from './server.js';

const program = new Command();
const authCommand = new Command('auth').description('Manage local AdSense OAuth credentials');
const loginCommand = new Command('login').description('Sign in to Google and grant read-only AdSense access');
program
  .name('adsense-mcp')
  .description('AdSense inventory and reporting tools for MCP-compatible clients.')
  .version('0.1.0-beta.1');

loginCommand.action(async () => {
  try {
    await login();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
});
authCommand.addCommand(loginCommand);
authCommand.action(() => authCommand.help());
program.addCommand(authCommand);

program.action(async () => {
  try {
    await startServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);
