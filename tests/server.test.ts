import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('FailSafe server binding', () => {
  it('binds to loopback only', async () => {
    const server = startServer(0);
    try {
      await new Promise<void>((resolve, reject) => {
        if (server.listening) resolve();
        else {
          server.once('listening', resolve);
          server.once('error', reject);
        }
      });
      const address = server.address() as AddressInfo;
      expect(address.address).toBe('127.0.0.1');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
