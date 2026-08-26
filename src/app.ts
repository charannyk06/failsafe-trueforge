import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Express, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { IncidentStore } from './incident/incident-store.js';
import { createFailSafeMcpServer } from './mcp/server.js';

const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));

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

export function createApp(store = new IncidentStore()): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', product: 'FailSafe', incidentId: store.getIncidentBrief().id });
  });

  app.get('/api/state', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(store.snapshot());
  });

  app.post('/api/reset', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(store.reset());
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

  app.get('/mcp', (_request, response) => methodNotAllowed(response));
  app.delete('/mcp', (_request, response) => methodNotAllowed(response));

  app.use(express.static(publicDirectory, { extensions: ['html'] }));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  return app;
}
