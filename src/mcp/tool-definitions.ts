import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

const read = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const TOOL_ANNOTATIONS = {
  incident_brief: read('Read incident brief'),
  service_health: read('Read service health'),
  metrics_query: read('Query incident metrics'),
  logs_search: read('Search incident logs'),
  recent_deployments: read('List recent deployments'),
  deployment_diff: read('Read deployment diff'),
  timeline_record: {
    title: 'Record incident timeline note',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  restart_service: {
    title: 'Restart a production service',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  rollback_deployment: {
    title: 'Roll back a production deployment',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  verify_recovery: read('Verify incident recovery'),
} as const satisfies Record<string, ToolAnnotations>;

export type ToolName = keyof typeof TOOL_ANNOTATIONS;
