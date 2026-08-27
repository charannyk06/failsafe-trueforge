import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('TrueForge integration contract', () => {
  it('approval-gates only the three human-controlled mutation tools', () => {
    const agent = JSON.parse(readProjectFile('trueforge/failsafe-agent.json')) as {
      manifest: {
        mcp_servers: Array<{ require_approval_for_tools: string[] }>;
        config: { sandbox: { enabled: boolean }; dynamic_sub_agents: { enabled: boolean } };
      };
    };

    expect(agent.manifest.mcp_servers[0]?.require_approval_for_tools).toEqual([
      'timeline_record',
      'restart_service',
      'rollback_deployment',
    ]);
    expect(agent.manifest.config.sandbox.enabled).toBe(true);
    expect(agent.manifest.config.dynamic_sub_agents.enabled).toBe(true);
  });

  it('pins the tested harness and fails fast when Daytona is missing', () => {
    const readme = readProjectFile('README.md');
    const configureScript = readProjectFile('scripts/configure-trueforge.mjs');

    expect(readme).toContain('npx @truefoundry/trueforge@0.1.4 --port 8790');
    expect(readme).toContain('Daytona sandbox provider');
    expect(configureScript).toContain("request('/settings/sandbox-providers')");
    expect(configureScript).toContain("sandboxProvider?.type !== 'daytona'");
  });
});
