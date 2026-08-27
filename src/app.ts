import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IncidentStore } from './incident/incident-store.js';
import { createFailSafeMcpServer } from './mcp/server.js';

const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const indexTemplate = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const initialStateMarker = '__FAILSAFE_INITIAL_STATE__';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);

function renderIndex(initialState: ReturnType<IncidentStore['snapshot']>): string {
  const serializedState = JSON.stringify(initialState).replaceAll('<', '\\u003c');
  return indexTemplate.replace(initialStateMarker, serializedState);
}

function requestHost(request: Request): string {
  const authority = request.headers.host ?? '';
  if (authority.startsWith('[')) {
    const closingBracket = authority.indexOf(']');
    return closingBracket === -1 ? '' : authority.slice(1, closingBracket);
  }
  return authority.split(':', 1)[0] ?? '';
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && loopbackHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function methodNotAllowed(response: Response): void {
  response
    .status(405)
    .set('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST for stateless Streamable HTTP.' },
      id: null,
    });
}

function isJsonParseError(error: unknown): boolean {
  return error instanceof SyntaxError && (error as { type?: unknown }).type === 'entity.parse.failed';
}

export function createApp(store = new IncidentStore()): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    if (!loopbackHosts.has(requestHost(request))) {
      response.status(403).json({ error: 'Invalid host' });
      return;
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !isLoopbackOrigin(origin)) {
      response.status(403).json({ error: 'Invalid origin' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    if (!isJsonParseError(error)) {
      next(error);
      return;
    }
    if (request.path === '/mcp') {
      response.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error: request body must contain valid JSON.' },
        id: null,
      });
      return;
    }
    response.status(400).json({ error: 'Malformed JSON' });
  });

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', product: 'FailSafe', incidentId: store.getIncidentBrief().id });
  });

  app.get('/api/state', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(store.snapshot());
  });

  app.post('/api/reset', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(store.reset());
  });

  app.get(['/', '/index.html'], (_request, response) => {
    response
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(renderIndex(store.snapshot()));
  });

  app.post('/mcp', async (request: Request, response: Response) => {
    const mcpServer = createFailSafeMcpServer(store);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on('close', () => {
      void transport.close();
      void mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error('MCP request failed', error);
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP server error' },
          id: null,
        });
      }
    }
  });

  app.all('/mcp', (_request, response) => methodNotAllowed(response));

  app.use(express.static(publicDirectory, { extensions: ['html'] }));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  return app;
}
