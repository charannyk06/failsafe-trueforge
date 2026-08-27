import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

const reply = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(status === 200 ? { data } : data));
};

describe('TrueForge configuration behavior', () => {
  it('accepts a nested Daytona manifest and reaches agent creation', async () => {
    let createdAgent = false;
    const server = createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const route = `${req.method} ${req.url}`;
        if (route === 'GET /api/v1/models') return reply(res, 200, [{ name: 'test/model' }]);
        if (route === 'GET /api/v1/settings/sandbox-providers') {
          return reply(res, 200, { manifest: { type: 'daytona', name: 'daytona' }, status: 'connected' });
        }
        if (route === 'PUT /api/v1/settings/mcp-servers') return reply(res, 200, { configured: true });
        if (route === 'GET /api/v1/mcp-servers/failsafe-incident-lab/tools') {
          return reply(res, 200, Array.from({ length: 10 }, (_, index) => ({ name: `tool-${index}` })));
        }
        if (route === 'GET /api/v1/agents') return reply(res, 200, []);
        if (route === 'POST /api/v1/agents') {
          createdAgent = true;
          const parsed = JSON.parse(body) as { name: string; manifest: Record<string, unknown> };
          return reply(res, 200, { id: 'agent-1', name: parsed.name, manifest: parsed.manifest });
        }
        return reply(res, 404, { error: `unexpected route ${route}` });
      });
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('mock server did not bind');

    try {
      const { stdout } = await run(process.execPath, ['scripts/configure-trueforge.mjs'], {
        cwd: new URL('..', import.meta.url),
        env: {
          ...process.env,
          TRUEFORGE_URL: `http://127.0.0.1:${address.port}`,
          FAILSAFE_MODEL: 'test/model',
        },
      });
      const output = JSON.parse(stdout) as { configured: boolean; sandboxProvider: string; tools: number };
      expect(output).toMatchObject({ configured: true, sandboxProvider: 'daytona', tools: 10 });
      expect(createdAgent).toBe(true);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
