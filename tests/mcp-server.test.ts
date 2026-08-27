import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BAD_DEPLOYMENT_ID,
  IncidentStore,
  STABLE_REVISION,
} from '../src/incident/incident-store.js';
import { createFailSafeMcpServer } from '../src/mcp/server.js';

const EXPECTED_TOOLS = [
  'incident_brief',
  'service_health',
  'metrics_query',
  'logs_search',
  'recent_deployments',
  'deployment_diff',
  'timeline_record',
  'restart_service',
  'rollback_deployment',
  'verify_recovery',
];

describe('FailSafe MCP server', () => {
  let client: Client;
  let server: ReturnType<typeof createFailSafeMcpServer>;

  beforeEach(async () => {
    const store = new IncidentStore();
    server = createFailSafeMcpServer(store);
    client = new Client({ name: 'failsafe-test-client', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('publishes the complete tool surface with approval-driving annotations', async () => {
    const tools = await client.listTools();

    expect(tools.tools.map(tool => tool.name)).toEqual(EXPECTED_TOOLS);
    expect(tools.tools.find(tool => tool.name === 'metrics_query')?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(tools.tools.find(tool => tool.name === 'rollback_deployment')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it('exposes structured incident evidence', async () => {
    const result = await client.callTool({ name: 'incident_brief', arguments: {} });
    const structured = result.structuredContent as { incident: { id: string; status: string } };

    expect(result.isError).not.toBe(true);
    expect(structured.incident).toEqual(expect.objectContaining({ id: 'INC-2048', status: 'investigating' }));
  });

  it('executes the approved rollback and verifies recovery', async () => {
    const rollback = await client.callTool({
      name: 'rollback_deployment',
      arguments: {
        service: 'checkout-api',
        deploymentId: BAD_DEPLOYMENT_ID,
        targetRevision: STABLE_REVISION,
        reason: 'The rc3 pool increase exhausted Postgres and restart preserves the fault.',
      },
    });
    expect(rollback.isError).not.toBe(true);
    expect(rollback.structuredContent).toMatchObject({ status: 'completed', incidentRecovered: false });

    const verification = await client.callTool({ name: 'verify_recovery', arguments: {} });
    expect(verification.structuredContent).toMatchObject({
      recovery: {
        incidentId: 'INC-2048',
        verified: true,
      },
    });
  });

  it('returns a tool error for an unknown deployment diff', async () => {
    const result = await client.callTool({
      name: 'deployment_diff',
      arguments: { deploymentId: 'deploy-unknown' },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContainEqual(
      expect.objectContaining({ type: 'text', text: 'No deployment diff found for deploy-unknown' }),
    );
  });
});
