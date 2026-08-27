/* global URL, console, fetch, process */

import { readFile } from 'node:fs/promises';

const trueforgeUrl = (process.env.TRUEFORGE_URL ?? 'http://localhost:8790').replace(/\/$/, '');
const mcpUrl = process.env.FAILSAFE_MCP_URL ?? 'http://localhost:3100/mcp';
const requestedModel = process.env.FAILSAFE_MODEL;
const agentFile = new URL('../trueforge/failsafe-agent.json', import.meta.url);
const agent = JSON.parse(await readFile(agentFile, 'utf8'));

if (requestedModel) agent.manifest.model.name = requestedModel;

async function request(path, options = {}) {
  const response = await fetch(`${trueforgeUrl}/api/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body?.data;
}

const models = await request('/models');
const selectedModel = models.find((model) => model.name === agent.manifest.model.name);
if (!selectedModel) {
  const available = models.map((model) => model.name).join(', ') || '(none configured)';
  throw new Error(
    `Model ${agent.manifest.model.name} is not configured in TrueForge. Add a provider first or set FAILSAFE_MODEL. Available: ${available}`,
  );
}

let sandboxProvider;
try {
  sandboxProvider = await request('/settings/sandbox-providers');
} catch (error) {
  throw new Error(
    `FailSafe requires a configured Daytona sandbox provider for generated code. Open TrueForge Settings → Sandbox providers, configure Daytona, and rerun this command. ${error instanceof Error ? error.message : String(error)}`,
  );
}
if (sandboxProvider?.type !== 'daytona') {
  throw new Error('FailSafe requires the supported Daytona sandbox provider before the agent can be configured.');
}

const connectorManifest = {
  type: 'remote',
  name: 'failsafe-incident-lab',
  url: mcpUrl,
  description: 'Synthetic production incident lab for evidence gathering, approval-gated remediation, and recovery verification.',
};

await request('/settings/mcp-servers', {
  method: 'PUT',
  body: JSON.stringify({ manifest: connectorManifest }),
});

const tools = await request('/mcp-servers/failsafe-incident-lab/tools');
if (tools.length !== 10) {
  throw new Error(`Expected 10 FailSafe MCP tools, discovered ${tools.length}. Is the incident lab running at ${mcpUrl}?`);
}

const agents = await request('/agents');
const existing = agents.find((item) => item.name === agent.name);
const saved = existing
  ? await request(`/agents/${encodeURIComponent(existing.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ manifest: agent.manifest }),
    })
  : await request('/agents', {
      method: 'POST',
      body: JSON.stringify(agent),
    });

console.log(JSON.stringify({
  configured: true,
  agent: saved.name,
  agentId: saved.id,
  model: saved.manifest.model.name,
  connector: connectorManifest.name,
  mcpUrl,
  tools: tools.length,
  approvals: saved.manifest.mcp_servers[0]?.require_approval_for_tools,
  sandbox: saved.manifest.config.sandbox.enabled,
  sandboxProvider: sandboxProvider.type,
  dynamicSubAgents: saved.manifest.config.dynamic_sub_agents.enabled,
}, null, 2));
