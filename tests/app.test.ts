import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BAD_REVISION } from '../src/incident/incident-store.js';

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP listener');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('FailSafe HTTP app', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>(resolve => server?.close(() => resolve()));
    server = undefined;
  });

  it('serves health and no-store incident state', async () => {
    const running = await listen();
    server = running.server;

    const healthResponse = await fetch(`${running.baseUrl}/api/health`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: 'ok', product: 'FailSafe', incidentId: 'INC-2048' });

    const stateResponse = await fetch(`${running.baseUrl}/api/state`);
    expect(stateResponse.headers.get('cache-control')).toBe('no-store');
    expect(await stateResponse.json()).toMatchObject({
      incident: { id: 'INC-2048', status: 'investigating' },
      remediation: { activeRevision: BAD_REVISION },
    });
  });

  it('serves the responsive incident console and static assets', async () => {
    const running = await listen();
    server = running.server;

    const pageResponse = await fetch(`${running.baseUrl}/`);
    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get('content-type')).toContain('text/html');
    const page = await pageResponse.text();
    expect(page).toContain('<title>FailSafe Incident Console</title>');
    expect(page).toContain('HUMAN APPROVAL BARRIER');

    const [styleResponse, scriptResponse] = await Promise.all([
      fetch(`${running.baseUrl}/styles.css`),
      fetch(`${running.baseUrl}/app.js`),
    ]);
    expect(styleResponse.status).toBe(200);
    expect(styleResponse.headers.get('content-type')).toContain('text/css');
    expect(scriptResponse.status).toBe(200);
    expect(scriptResponse.headers.get('content-type')).toContain('javascript');
  });

  it('serves successful Streamable HTTP MCP discovery and tool calls', async () => {
    const running = await listen();
    server = running.server;
    const client = new Client({ name: 'failsafe-http-test', version: '1.0.0' });

    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${running.baseUrl}/mcp`)));
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(10);
      expect(tools.tools.map(tool => tool.name)).toContain('rollback_deployment');

      const brief = await client.callTool({ name: 'incident_brief', arguments: {} });
      expect(brief.structuredContent).toMatchObject({
        incident: { id: 'INC-2048', status: 'investigating' },
      });
    } finally {
      await client.close();
    }
  });

  it('rejects unsupported MCP methods and unknown routes', async () => {
    const running = await listen();
    server = running.server;

    const mcpResponse = await fetch(`${running.baseUrl}/mcp`);
    expect(mcpResponse.status).toBe(405);
    expect(mcpResponse.headers.get('allow')).toBe('POST');

    const missingResponse = await fetch(`${running.baseUrl}/not-found`);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: 'Not found' });
  });
});
