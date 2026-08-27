import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { execFile } from 'node:child_process';
import { request as httpRequest, type Server } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BAD_REVISION } from '../src/incident/incident-store.js';

const execFileAsync = promisify(execFile);
const resetScript = fileURLToPath(new URL('../scripts/reset-demo.mjs', import.meta.url));

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

async function requestWithHost(baseUrl: string, host: string): Promise<{ status: number; body: unknown }> {
  const url = new URL('/api/health', baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: { host },
      },
      response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(body) });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
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

    const [styleResponse, scriptResponse, faviconResponse] = await Promise.all([
      fetch(`${running.baseUrl}/styles.css`),
      fetch(`${running.baseUrl}/app.js`),
      fetch(`${running.baseUrl}/favicon.svg`),
    ]);
    expect(styleResponse.status).toBe(200);
    expect(styleResponse.headers.get('content-type')).toContain('text/css');
    expect(scriptResponse.status).toBe(200);
    expect(scriptResponse.headers.get('content-type')).toContain('javascript');
    expect(faviconResponse.status).toBe(200);
    expect(faviconResponse.headers.get('content-type')).toContain('image/svg+xml');
    const script = await scriptResponse.text();
    expect(script).toContain('LAB API ONLINE');
    expect(script).not.toContain('MCP ONLINE');
  });

  it('keeps the static incident console operational before state sync', async () => {
    const running = await listen();
    server = running.server;

    const [pageResponse, styleResponse] = await Promise.all([
      fetch(`${running.baseUrl}/`),
      fetch(`${running.baseUrl}/styles.css`),
    ]);
    const page = await pageResponse.text();
    const styles = await styleResponse.text();

    expect(pageResponse.headers.get('cache-control')).toBe('no-store');
    expect(page).not.toContain('__FAILSAFE_INITIAL_STATE__');
    expect(page).toContain('<script id="initial-state" type="application/json">{"incident":');
    expect(page).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(page).toContain('<a class="brand" href="/">');
    expect(page).not.toContain('aria-label="FailSafe home"');

    expect(page).not.toContain('class="section-index"');
    expect([...page.matchAll(/<li data-stage="[^"]+"><span>(0[1-5])<\/span>/g)].map(match => match[1])).toEqual([
      '01', '02', '03', '04', '05',
    ]);
    expect(page).toContain('<h2 id="services-title">Service health</h2>');
    expect(page).toContain('<h2 id="command-title">Response plan</h2>');
    expect(page).not.toContain('Service field');
    expect(page).not.toContain('Agent command rail');

    expect(page).toContain('Checkout failures after rc3 deployment');
    expect(page).toContain('31% drop in checkout conversion; 27.4% of checkout requests failing.');
    expect(page).toContain('Started 14:04:02Z');

    expect(page).toContain('<span class="environment">SYNTHETIC PRODUCTION</span>');
    const mobileStyles = styles.slice(styles.indexOf('@media (max-width: 680px)'));
    expect(mobileStyles).toContain('.masthead-center { display: flex;');
    expect(mobileStyles).toContain('.masthead-center .eyebrow, .masthead-center .separator { display: none; }');
    expect(mobileStyles).toContain('.connection .pulse { display: block; }');

    expect(styles).not.toContain('clamp(');
    expect(styles).toContain('--faint: #81827e;');
    expect(styles).not.toContain('opacity: .48;');
    expect(styles).toMatch(/h1 \{[^}]*font-size: 56px;/);
    expect(styles).toMatch(/\.metric-value \{[^}]*font: 600 36px\/1 var\(--mono\);/);
    expect(styles).toMatch(/\.causality h3 \{[^}]*font-size: 36px;/);
    expect(mobileStyles).toMatch(/h1 \{[^}]*font-size: 42px;/);
  });

  it('rejects non-loopback Host headers before serving any route', async () => {
    const running = await listen();
    server = running.server;

    const response = await requestWithHost(running.baseUrl, 'attacker.example');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Invalid host' });
  });

  it('rejects cross-origin browser mutations while allowing loopback origins', async () => {
    const running = await listen();
    server = running.server;

    for (const path of ['/api/reset', '/mcp']) {
      const response = await fetch(`${running.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://attacker.example',
        },
        body: '{}',
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Invalid origin' });
    }

    const allowedResponse = await fetch(`${running.baseUrl}/api/reset`, {
      method: 'POST',
      headers: { origin: running.baseUrl },
    });
    expect(allowedResponse.status).toBe(200);
  });

  it('resets successfully when FAILSAFE_URL has a trailing slash', async () => {
    const running = await listen();
    server = running.server;

    const result = await execFileAsync(process.execPath, [resetScript], {
      env: { ...process.env, FAILSAFE_URL: `${running.baseUrl}/` },
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      incidentId: 'INC-2048',
      status: 'investigating',
      reset: true,
    });
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

  it('returns JSON-RPC parse errors for malformed MCP JSON', async () => {
    const running = await listen();
    server = running.server;

    const response = await fetch(`${running.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"jsonrpc":',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error: request body must contain valid JSON.' },
      id: null,
    });
  });

  it('rejects every unsupported MCP method and unknown routes', async () => {
    const running = await listen();
    server = running.server;

    for (const method of ['GET', 'DELETE', 'PUT', 'PATCH', 'OPTIONS']) {
      const mcpResponse = await fetch(`${running.baseUrl}/mcp`, { method });
      expect(mcpResponse.status).toBe(405);
      expect(mcpResponse.headers.get('allow')).toBe('POST');
      expect(await mcpResponse.json()).toMatchObject({ jsonrpc: '2.0', id: null });
    }

    const missingResponse = await fetch(`${running.baseUrl}/not-found`);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: 'Not found' });
  });
});
