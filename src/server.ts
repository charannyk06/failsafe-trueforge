import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';

export function startServer(port = Number(process.env.PORT ?? 3100)) {
  const app = createApp();
  const host = '127.0.0.1';
  const httpServer = app.listen(port, host, () => {
    const address = httpServer.address();
    const listeningPort = typeof address === 'object' && address !== null ? address.port : port;
    console.log(`FailSafe incident lab running at http://${host}:${listeningPort}`);
    console.log(`Stateless MCP endpoint: http://${host}:${listeningPort}/mcp`);
  });
  return httpServer;
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entrypoint) {
  const server = startServer();
  const shutdown = (signal: string) => {
    console.log(`${signal} received; shutting down FailSafe.`);
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
