import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { IncidentStore } from '../incident/incident-store.js';
import { TOOL_ANNOTATIONS } from './tool-definitions.js';

const serviceSchema = z.enum(['edge-gateway', 'checkout-api', 'payments-api', 'postgres-primary']);
const metricSchema = z.enum([
  'checkout_http_5xx_rate_percent',
  'checkout_p95_latency_ms',
  'checkout_success_rate_percent',
  'postgres_active_connections',
]);

const incidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.literal('SEV-1'),
  status: z.enum(['investigating', 'resolved']),
  startedAt: z.string(),
  resolvedAt: z.string().nullable(),
  customerImpact: z.string(),
  hypothesis: z.string(),
  requiredRecoveryAction: z.string(),
});

const serviceHealthSchema = z.object({
  service: serviceSchema,
  status: z.enum(['healthy', 'degraded', 'critical']),
  revision: z.string(),
  replicasReady: z.string(),
  message: z.string(),
});

const metricSeriesSchema = z.object({
  metric: metricSchema,
  label: z.string(),
  unit: z.enum(['percent', 'milliseconds', 'connections']),
  service: serviceSchema,
  points: z.array(z.object({ timestamp: z.string(), value: z.number() })),
  threshold: z.number(),
  thresholdDirection: z.enum(['above', 'below']),
});

const logSchema = z.object({
  timestamp: z.string(),
  level: z.enum(['INFO', 'WARN', 'ERROR']),
  service: serviceSchema,
  message: z.string(),
  traceId: z.string().optional(),
});

const deploymentSchema = z.object({
  id: z.string(),
  service: serviceSchema,
  revision: z.string(),
  status: z.enum(['superseded', 'active', 'rolled-back']),
  deployedAt: z.string(),
  commit: z.string(),
  author: z.string(),
  changeTicket: z.string(),
});

const timelineEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  kind: z.enum(['deployment', 'signal', 'incident', 'note', 'action', 'recovery']),
  actor: z.string(),
  summary: z.string(),
  evidence: z.string().optional(),
});

const recoverySchema = z.object({
  incidentId: z.string(),
  verified: z.boolean(),
  verdict: z.string(),
  checkedAt: z.string(),
  checks: z.array(
    z.object({ check: z.string(), expected: z.string(), observed: z.string(), passed: z.boolean() }),
  ),
});

function toolResult(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function toolError(error: unknown) {
  return {
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
    isError: true as const,
  };
}

export function createFailSafeMcpServer(store: IncidentStore): McpServer {
  const server = new McpServer(
    {
      name: 'failsafe-incident-lab',
      version: '0.1.0',
      title: 'FailSafe Incident Lab',
      websiteUrl: 'http://localhost:3100',
    },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    'incident_brief',
    {
      title: 'Get incident brief',
      description:
        'Return the current SEV-1 incident brief, customer impact, working hypothesis, and the exact recovery requirement.',
      outputSchema: { incident: incidentSchema },
      annotations: TOOL_ANNOTATIONS.incident_brief,
    },
    async () => toolResult({ incident: store.getIncidentBrief() }),
  );

  server.registerTool(
    'service_health',
    {
      title: 'Get service health',
      description: 'Inspect current revisions, replica readiness, and health for one service or the entire incident scope.',
      inputSchema: { service: serviceSchema.optional() },
      outputSchema: { services: z.array(serviceHealthSchema) },
      annotations: TOOL_ANNOTATIONS.service_health,
    },
    async ({ service }) => toolResult({ services: store.getServiceHealth(service) }),
  );

  server.registerTool(
    'metrics_query',
    {
      title: 'Query incident metrics',
      description:
        'Return deterministic time series for checkout errors, latency, success rate, and Postgres connections. Use in Code Mode for exact correlation.',
      inputSchema: { metric: metricSchema.optional(), service: serviceSchema.optional() },
      outputSchema: { series: z.array(metricSeriesSchema) },
      annotations: TOOL_ANNOTATIONS.metrics_query,
    },
    async ({ metric, service }) => toolResult({ series: store.queryMetrics(metric, service) }),
  );

  server.registerTool(
    'logs_search',
    {
      title: 'Search production logs',
      description:
        'Search synthetic production logs by service and text. Returns timestamps, levels, messages, and trace IDs when present.',
      inputSchema: {
        service: serviceSchema.optional(),
        query: z.string().max(200).default(''),
        limit: z.number().int().min(1).max(100).default(50),
      },
      outputSchema: { entries: z.array(logSchema), count: z.number().int() },
      annotations: TOOL_ANNOTATIONS.logs_search,
    },
    async ({ service, query, limit }) => {
      const entries = store.searchLogs(service, query, limit);
      return toolResult({ entries, count: entries.length });
    },
  );

  server.registerTool(
    'recent_deployments',
    {
      title: 'List recent deployments',
      description: 'List recent deployments and identify the active and last known-good revisions for a service.',
      inputSchema: { service: serviceSchema.optional() },
      outputSchema: { deployments: z.array(deploymentSchema) },
      annotations: TOOL_ANNOTATIONS.recent_deployments,
    },
    async ({ service }) => toolResult({ deployments: store.getRecentDeployments(service) }),
  );

  server.registerTool(
    'deployment_diff',
    {
      title: 'Inspect deployment diff',
      description: 'Inspect the exact configuration diff for a deployment before proposing remediation.',
      inputSchema: { deploymentId: z.string().min(1).describe('Deployment ID from recent_deployments') },
      outputSchema: {
        deploymentId: z.string(),
        baseRevision: z.string(),
        candidateRevision: z.string(),
        summary: z.string(),
        files: z.array(z.object({ path: z.string(), patch: z.string() })),
      },
      annotations: TOOL_ANNOTATIONS.deployment_diff,
    },
    async ({ deploymentId }) => {
      try {
        return toolResult(store.getDeploymentDiff(deploymentId));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'timeline_record',
    {
      title: 'Record timeline note',
      description:
        'Append an evidence-backed investigation note to the incident timeline. This is a write and TrueForge should request approval via @write.',
      inputSchema: {
        summary: z.string().min(3).max(300),
        actor: z.string().min(2).max(80).default('failsafe-agent'),
        evidence: z.string().max(500).optional(),
      },
      outputSchema: { event: timelineEventSchema },
      annotations: TOOL_ANNOTATIONS.timeline_record,
    },
    async ({ summary, actor, evidence }) => toolResult({ event: store.recordTimeline(summary, actor, evidence) }),
  );

  server.registerTool(
    'restart_service',
    {
      title: 'Restart production service',
      description:
        'DESTRUCTIVE: Restart a service. Restarting checkout-api on rc3 will not recover this incident because the bad pool configuration remains.',
      inputSchema: {
        service: serviceSchema,
        reason: z.string().min(8).max(300).describe('Operator-visible justification shown in the approval card'),
      },
      outputSchema: {
        operationId: z.string(),
        service: serviceSchema,
        status: z.enum(['completed', 'completed_without_recovery']),
        activeRevision: z.string(),
        incidentRecovered: z.boolean(),
        message: z.string(),
      },
      annotations: TOOL_ANNOTATIONS.restart_service,
    },
    async ({ service, reason }) => toolResult(store.restartService(service, reason)),
  );

  server.registerTool(
    'rollback_deployment',
    {
      title: 'Roll back production deployment',
      description:
        'DESTRUCTIVE: Roll checkout-api from the active bad deployment to the explicit last known-good revision. Human approval is required before execution.',
      inputSchema: {
        service: serviceSchema,
        deploymentId: z.string().min(1),
        targetRevision: z.string().min(1),
        reason: z.string().min(12).max(500).describe('Evidence-backed rollback justification shown to the human approver'),
      },
      outputSchema: {
        operationId: z.string(),
        status: z.enum(['completed', 'already_completed']),
        fromRevision: z.string(),
        toRevision: z.string(),
        incidentRecovered: z.boolean(),
        message: z.string(),
      },
      annotations: TOOL_ANNOTATIONS.rollback_deployment,
    },
    async input => {
      try {
        return toolResult(store.rollbackDeployment(input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'verify_recovery',
    {
      title: 'Verify incident recovery',
      description:
        'Evaluate every recovery gate and idempotently record a successful verification in the local audit state. This non-destructive write cannot change service configuration and is intentionally exempt from human approval.',
      outputSchema: { recovery: recoverySchema },
      annotations: TOOL_ANNOTATIONS.verify_recovery,
    },
    async () => toolResult({ recovery: store.verifyRecovery() }),
  );

  return server;
}
