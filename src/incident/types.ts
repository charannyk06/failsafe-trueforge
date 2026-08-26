export type IncidentStatus = 'investigating' | 'resolved';
export type ServiceStatus = 'healthy' | 'degraded' | 'critical';
export type ServiceName = 'edge-gateway' | 'checkout-api' | 'payments-api' | 'postgres-primary';
export type MetricName =
  | 'checkout_http_5xx_rate_percent'
  | 'checkout_p95_latency_ms'
  | 'checkout_success_rate_percent'
  | 'postgres_active_connections';

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface MetricSeries {
  metric: MetricName;
  label: string;
  unit: 'percent' | 'milliseconds' | 'connections';
  service: ServiceName;
  points: MetricPoint[];
  threshold: number;
  thresholdDirection: 'above' | 'below';
}

export interface ServiceHealth {
  service: ServiceName;
  status: ServiceStatus;
  revision: string;
  replicasReady: string;
  message: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  service: ServiceName;
  message: string;
  traceId?: string;
}

export interface Deployment {
  id: string;
  service: ServiceName;
  revision: string;
  status: 'superseded' | 'active' | 'rolled-back';
  deployedAt: string;
  commit: string;
  author: string;
  changeTicket: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  kind: 'deployment' | 'signal' | 'incident' | 'note' | 'action' | 'recovery';
  actor: string;
  summary: string;
  evidence?: string;
}

export interface RecoveryCheck {
  check: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface RecoveryVerification {
  incidentId: string;
  verified: boolean;
  verdict: string;
  checkedAt: string;
  checks: RecoveryCheck[];
}

export interface IncidentSnapshot {
  incident: {
    id: string;
    title: string;
    severity: 'SEV-1';
    status: IncidentStatus;
    startedAt: string;
    resolvedAt: string | null;
    customerImpact: string;
    hypothesis: string;
    requiredRecoveryAction: string;
  };
  services: ServiceHealth[];
  metrics: MetricSeries[];
  logs: LogEntry[];
  deployments: Deployment[];
  deploymentDiff: {
    deploymentId: string;
    baseRevision: string;
    candidateRevision: string;
    summary: string;
    files: Array<{ path: string; patch: string }>;
  };
  timeline: TimelineEvent[];
  remediation: {
    restartAttempts: number;
    rollbackApplied: boolean;
    activeRevision: string;
  };
  recovery: RecoveryVerification;
}
