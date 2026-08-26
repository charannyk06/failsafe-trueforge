import type {
  Deployment,
  IncidentSnapshot,
  LogEntry,
  MetricName,
  MetricSeries,
  RecoveryVerification,
  ServiceHealth,
  ServiceName,
  TimelineEvent,
} from './types.js';

export const INCIDENT_ID = 'INC-2048';
export const BAD_DEPLOYMENT_ID = 'deploy-checkout-7f3a9c1';
export const BAD_REVISION = 'checkout-api@2026.08.26-rc3';
export const STABLE_REVISION = 'checkout-api@2026.08.26-rc2';

const metricTimes = [
  '2026-08-26T14:00:00.000Z',
  '2026-08-26T14:02:00.000Z',
  '2026-08-26T14:04:00.000Z',
  '2026-08-26T14:06:00.000Z',
  '2026-08-26T14:08:00.000Z',
  '2026-08-26T14:10:00.000Z',
];

const recoveryMetricTimes = [
  '2026-08-26T14:11:10.000Z',
  '2026-08-26T14:11:18.000Z',
  '2026-08-26T14:11:26.000Z',
  '2026-08-26T14:11:34.000Z',
  '2026-08-26T14:11:42.000Z',
  '2026-08-26T14:11:50.000Z',
];

const points = (values: number[], timestamps = metricTimes) =>
  values.map((value, index) => ({ timestamp: timestamps[index]!, value }));

const baseLogs: LogEntry[] = [
  {
    timestamp: '2026-08-26T14:02:11.000Z',
    level: 'INFO',
    service: 'checkout-api',
    message: 'boot complete revision=checkout-api@2026.08.26-rc3 replicas=6 pool_max=80',
  },
  {
    timestamp: '2026-08-26T14:03:44.000Z',
    level: 'WARN',
    service: 'postgres-primary',
    message: 'connection utilization crossed 85% active=174 max=200',
  },
  {
    timestamp: '2026-08-26T14:04:02.000Z',
    level: 'ERROR',
    service: 'checkout-api',
    message: 'checkout request failed: acquire timeout after 250ms; pool exhausted active=80 idle=0 waiting=143',
    traceId: 'trc_81f2c7',
  },
  {
    timestamp: '2026-08-26T14:04:05.000Z',
    level: 'ERROR',
    service: 'checkout-api',
    message: 'Prisma P2024: timed out fetching a new connection from the pool',
    traceId: 'trc_18a4de',
  },
  {
    timestamp: '2026-08-26T14:04:08.000Z',
    level: 'ERROR',
    service: 'edge-gateway',
    message: 'upstream checkout-api returned 503 route=POST /v1/checkout latency_ms=2441',
    traceId: 'trc_81f2c7',
  },
  {
    timestamp: '2026-08-26T14:04:21.000Z',
    level: 'WARN',
    service: 'payments-api',
    message: 'payment authorization healthy; checkout confirmation callback delayed',
  },
  {
    timestamp: '2026-08-26T14:05:16.000Z',
    level: 'ERROR',
    service: 'postgres-primary',
    message: 'remaining connection slots are reserved for superuser connections active=198 max=200',
  },
  {
    timestamp: '2026-08-26T14:06:00.000Z',
    level: 'ERROR',
    service: 'checkout-api',
    message: 'SLO burn alert: 5xx_rate=27.4% p95_ms=2420 window=5m',
  },
];

const initialTimeline: TimelineEvent[] = [
  {
    id: 'evt-001',
    timestamp: '2026-08-26T14:02:00.000Z',
    kind: 'deployment',
    actor: 'deploy-bot',
    summary: 'checkout-api rc3 reached 100% traffic',
    evidence: BAD_DEPLOYMENT_ID,
  },
  {
    id: 'evt-002',
    timestamp: '2026-08-26T14:03:44.000Z',
    kind: 'signal',
    actor: 'postgres-monitor',
    summary: 'Database connection utilization crossed 85%',
    evidence: '174 / 200 active connections',
  },
  {
    id: 'evt-003',
    timestamp: '2026-08-26T14:04:02.000Z',
    kind: 'signal',
    actor: 'checkout-slo',
    summary: 'Checkout 5xx rate breached the 2% SLO',
    evidence: '27.4% HTTP 5xx',
  },
  {
    id: 'evt-004',
    timestamp: '2026-08-26T14:06:00.000Z',
    kind: 'incident',
    actor: 'pager',
    summary: 'SEV-1 incident INC-2048 declared',
    evidence: 'Checkout conversion down 31%',
  },
];

function degradedMetrics(): MetricSeries[] {
  return [
    {
      metric: 'checkout_http_5xx_rate_percent',
      label: 'Checkout HTTP 5xx',
      unit: 'percent',
      service: 'checkout-api',
      points: points([0.3, 0.4, 8.8, 21.6, 27.4, 26.8]),
      threshold: 2,
      thresholdDirection: 'above',
    },
    {
      metric: 'checkout_p95_latency_ms',
      label: 'Checkout p95 latency',
      unit: 'milliseconds',
      service: 'checkout-api',
      points: points([182, 191, 920, 1880, 2420, 2384]),
      threshold: 500,
      thresholdDirection: 'above',
    },
    {
      metric: 'checkout_success_rate_percent',
      label: 'Checkout success rate',
      unit: 'percent',
      service: 'checkout-api',
      points: points([99.7, 99.6, 91.2, 78.4, 72.6, 73.2]),
      threshold: 99,
      thresholdDirection: 'below',
    },
    {
      metric: 'postgres_active_connections',
      label: 'Postgres active connections',
      unit: 'connections',
      service: 'postgres-primary',
      points: points([82, 91, 174, 193, 198, 197]),
      threshold: 160,
      thresholdDirection: 'above',
    },
  ];
}

function recoveredMetrics(): MetricSeries[] {
  return [
    {
      ...degradedMetrics()[0]!,
      points: points([27.4, 19.2, 8.1, 2.4, 0.8, 0.4], recoveryMetricTimes),
    },
    {
      ...degradedMetrics()[1]!,
      points: points([2420, 1710, 890, 481, 244, 196], recoveryMetricTimes),
    },
    {
      ...degradedMetrics()[2]!,
      points: points([72.6, 80.8, 91.9, 97.6, 99.2, 99.6], recoveryMetricTimes),
    },
    {
      ...degradedMetrics()[3]!,
      points: points([198, 176, 142, 116, 94, 84], recoveryMetricTimes),
    },
  ];
}

const deployments: Deployment[] = [
  {
    id: BAD_DEPLOYMENT_ID,
    service: 'checkout-api',
    revision: BAD_REVISION,
    status: 'active',
    deployedAt: '2026-08-26T14:02:00.000Z',
    commit: '7f3a9c1',
    author: 'maya.chen',
    changeTicket: 'CHG-4821',
  },
  {
    id: 'deploy-checkout-61b8ee0',
    service: 'checkout-api',
    revision: STABLE_REVISION,
    status: 'superseded',
    deployedAt: '2026-08-25T19:30:00.000Z',
    commit: '61b8ee0',
    author: 'noah.williams',
    changeTicket: 'CHG-4807',
  },
  {
    id: 'deploy-payments-b4d20af',
    service: 'payments-api',
    revision: 'payments-api@2026.08.25-rc8',
    status: 'active',
    deployedAt: '2026-08-25T21:14:00.000Z',
    commit: 'b4d20af',
    author: 'deploy-bot',
    changeTicket: 'CHG-4809',
  },
];

const deploymentDiff = {
  deploymentId: BAD_DEPLOYMENT_ID,
  baseRevision: STABLE_REVISION,
  candidateRevision: BAD_REVISION,
  summary: 'rc3 raised each checkout replica pool from 20 to 80 connections and shortened acquisition timeout.',
  files: [
    {
      path: 'services/checkout/config/production.yaml',
      patch: '@@ database:\n-  pool_max: 20\n-  acquire_timeout_ms: 2000\n+  pool_max: 80\n+  acquire_timeout_ms: 250',
    },
    {
      path: 'services/checkout/deploy/production.yaml',
      patch: '@@ checkout-api:\n   replicas: 6\n+  rollout_note: "raise pool ceiling for holiday load"',
    },
  ],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class IncidentStore {
  private rolledBack = false;
  private restartAttempts = 0;
  private customTimeline: TimelineEvent[] = [];
  private actionLogs: LogEntry[] = [];

  reset(): IncidentSnapshot {
    this.rolledBack = false;
    this.restartAttempts = 0;
    this.customTimeline = [];
    this.actionLogs = [];
    return this.snapshot();
  }

  getIncidentBrief() {
    return clone(this.snapshot().incident);
  }

  getServiceHealth(service?: ServiceName): ServiceHealth[] {
    const services = this.snapshot().services;
    return service ? services.filter(item => item.service === service) : services;
  }

  queryMetrics(metric?: MetricName, service?: ServiceName): MetricSeries[] {
    return (this.rolledBack ? recoveredMetrics() : degradedMetrics()).filter(
      series => (!metric || series.metric === metric) && (!service || series.service === service),
    );
  }

  searchLogs(service?: ServiceName, query = '', limit = 50): LogEntry[] {
    const needle = query.trim().toLowerCase();
    return [...baseLogs, ...this.actionLogs]
      .filter(entry => !service || entry.service === service)
      .filter(entry => !needle || `${entry.level} ${entry.message} ${entry.traceId ?? ''}`.toLowerCase().includes(needle))
      .slice(-limit)
      .map(clone);
  }

  getRecentDeployments(service?: ServiceName): Deployment[] {
    return deployments
      .map(deployment => {
        if (deployment.id === BAD_DEPLOYMENT_ID && this.rolledBack) return { ...deployment, status: 'rolled-back' as const };
        if (deployment.revision === STABLE_REVISION && this.rolledBack) return { ...deployment, status: 'active' as const };
        return deployment;
      })
      .filter(deployment => !service || deployment.service === service)
      .map(clone);
  }

  getDeploymentDiff(deploymentId: string) {
    if (deploymentId !== BAD_DEPLOYMENT_ID) {
      throw new Error(`No deployment diff found for ${deploymentId}`);
    }
    return clone(deploymentDiff);
  }

  recordTimeline(summary: string, actor: string, evidence?: string): TimelineEvent {
    const sequence = this.customTimeline.length + 5;
    const event: TimelineEvent = {
      id: `evt-${String(sequence).padStart(3, '0')}`,
      timestamp: `2026-08-26T14:${String(6 + this.customTimeline.length).padStart(2, '0')}:30.000Z`,
      kind: 'note',
      actor,
      summary,
      ...(evidence ? { evidence } : {}),
    };
    this.customTimeline.push(event);
    return clone(event);
  }

  restartService(service: ServiceName, reason: string) {
    this.restartAttempts += 1;
    const operationId = `restart-${String(this.restartAttempts).padStart(3, '0')}`;
    const stillDegraded = !this.rolledBack && service === 'checkout-api';
    this.customTimeline.push({
      id: `evt-${String(this.customTimeline.length + 5).padStart(3, '0')}`,
      timestamp: `2026-08-26T14:${String(6 + this.customTimeline.length).padStart(2, '0')}:30.000Z`,
      kind: 'action',
      actor: 'failsafe-agent',
      summary: `Restarted ${service}: ${reason}`,
      evidence: stillDegraded ? 'Pods restarted on the same bad rc3 revision; incident persists.' : 'Restart completed.',
    });
    this.actionLogs.push({
      timestamp: '2026-08-26T14:09:30.000Z',
      level: stillDegraded ? 'ERROR' : 'INFO',
      service,
      message: stillDegraded
        ? `restart complete operation=${operationId}; revision=${BAD_REVISION}; pool exhausted again after 11s`
        : `restart complete operation=${operationId}`,
    });
    return {
      operationId,
      service,
      status: stillDegraded ? ('completed_without_recovery' as const) : ('completed' as const),
      activeRevision: this.rolledBack && service === 'checkout-api' ? STABLE_REVISION : this.revisionFor(service),
      incidentRecovered: this.rolledBack,
      message: stillDegraded
        ? 'Restart did not recover checkout-api because it relaunched the same bad deployment.'
        : 'Service restart completed.',
    };
  }

  rollbackDeployment(input: { service: ServiceName; deploymentId: string; targetRevision: string; reason: string }) {
    if (input.service !== 'checkout-api') throw new Error('Only checkout-api owns the incident deployment.');
    if (input.deploymentId !== BAD_DEPLOYMENT_ID) throw new Error(`Refusing rollback: ${input.deploymentId} is not active.`);
    if (input.targetRevision !== STABLE_REVISION) {
      throw new Error(`Refusing rollback: target must be the last known-good revision ${STABLE_REVISION}.`);
    }
    if (this.rolledBack) {
      return {
        operationId: 'rollback-001',
        status: 'already_completed' as const,
        fromRevision: BAD_REVISION,
        toRevision: STABLE_REVISION,
        incidentRecovered: true,
        message: 'Rollback was already applied; no additional mutation performed.',
      };
    }

    this.rolledBack = true;
    this.customTimeline.push({
      id: `evt-${String(this.customTimeline.length + 5).padStart(3, '0')}`,
      timestamp: '2026-08-26T14:11:00.000Z',
      kind: 'recovery',
      actor: 'failsafe-agent',
      summary: `Rolled checkout-api back to ${STABLE_REVISION}`,
      evidence: input.reason,
    });
    this.actionLogs.push(
      {
        timestamp: '2026-08-26T14:11:08.000Z',
        level: 'INFO',
        service: 'checkout-api',
        message: `rollback complete from=${BAD_REVISION} to=${STABLE_REVISION} ready=6/6`,
      },
      {
        timestamp: '2026-08-26T14:11:21.000Z',
        level: 'INFO',
        service: 'postgres-primary',
        message: 'connection pressure cleared active=84 max=200',
      },
      {
        timestamp: '2026-08-26T14:11:36.000Z',
        level: 'INFO',
        service: 'edge-gateway',
        message: 'checkout upstream healthy 5xx_rate=0.4% p95_ms=196',
      },
    );

    return {
      operationId: 'rollback-001',
      status: 'completed' as const,
      fromRevision: BAD_REVISION,
      toRevision: STABLE_REVISION,
      incidentRecovered: true,
      message: 'Rollback completed. Run verify_recovery before closing the incident.',
    };
  }

  verifyRecovery(): RecoveryVerification {
    const metrics = this.queryMetrics();
    const latest = (name: MetricName) => metrics.find(series => series.metric === name)!.points.at(-1)!.value;
    const checks = [
      {
        check: 'checkout_http_5xx_rate_percent',
        expected: '< 2%',
        observed: `${latest('checkout_http_5xx_rate_percent')}%`,
        passed: latest('checkout_http_5xx_rate_percent') < 2,
      },
      {
        check: 'checkout_p95_latency_ms',
        expected: '< 500ms',
        observed: `${latest('checkout_p95_latency_ms')}ms`,
        passed: latest('checkout_p95_latency_ms') < 500,
      },
      {
        check: 'postgres_active_connections',
        expected: '< 160',
        observed: String(latest('postgres_active_connections')),
        passed: latest('postgres_active_connections') < 160,
      },
      {
        check: 'active_revision',
        expected: STABLE_REVISION,
        observed: this.rolledBack ? STABLE_REVISION : BAD_REVISION,
        passed: this.rolledBack,
      },
    ];
    const verified = this.rolledBack && checks.every(check => check.passed);
    return {
      incidentId: INCIDENT_ID,
      verified,
      verdict: verified
        ? 'Recovery verified: checkout and database signals are within SLO on the last known-good revision.'
        : 'Recovery not verified: rollback is required and one or more signals remain outside SLO.',
      checkedAt: this.rolledBack ? '2026-08-26T14:12:00.000Z' : '2026-08-26T14:10:00.000Z',
      checks,
    };
  }

  snapshot(): IncidentSnapshot {
    const activeCheckoutRevision = this.rolledBack ? STABLE_REVISION : BAD_REVISION;
    const services: ServiceHealth[] = this.rolledBack
      ? [
          { service: 'edge-gateway', status: 'healthy', revision: 'edge-gateway@2026.08.22-rc4', replicasReady: '4/4', message: 'All routes within SLO.' },
          { service: 'checkout-api', status: 'healthy', revision: STABLE_REVISION, replicasReady: '6/6', message: 'Checkout success rate restored.' },
          { service: 'payments-api', status: 'healthy', revision: 'payments-api@2026.08.25-rc8', replicasReady: '4/4', message: 'Authorization path healthy.' },
          { service: 'postgres-primary', status: 'healthy', revision: 'postgres@15.8', replicasReady: '1/1', message: 'Connection utilization at 42%.' },
        ]
      : [
          { service: 'edge-gateway', status: 'degraded', revision: 'edge-gateway@2026.08.22-rc4', replicasReady: '4/4', message: 'Checkout upstream returning 503.' },
          { service: 'checkout-api', status: 'critical', revision: BAD_REVISION, replicasReady: '6/6', message: 'DB pool acquisition timeouts; 27.4% 5xx.' },
          { service: 'payments-api', status: 'healthy', revision: 'payments-api@2026.08.25-rc8', replicasReady: '4/4', message: 'Authorization healthy; callbacks delayed.' },
          { service: 'postgres-primary', status: 'critical', revision: 'postgres@15.8', replicasReady: '1/1', message: '198 / 200 connections active.' },
        ];

    return {
      incident: {
        id: INCIDENT_ID,
        title: 'Checkout failures after rc3 deployment',
        severity: 'SEV-1',
        status: this.rolledBack ? 'resolved' : 'investigating',
        startedAt: '2026-08-26T14:04:02.000Z',
        resolvedAt: this.rolledBack ? '2026-08-26T14:12:00.000Z' : null,
        customerImpact: this.rolledBack ? 'Recovered; checkout success is 99.6%.' : '31% drop in checkout conversion; 27.4% of checkout requests failing.',
        hypothesis: 'checkout-api rc3 multiplied connection demand beyond the Postgres 200-connection ceiling.',
        requiredRecoveryAction: `Roll back ${BAD_DEPLOYMENT_ID} to ${STABLE_REVISION}. A restart preserves the bad configuration and cannot recover the incident.`,
      },
      services,
      metrics: this.queryMetrics(),
      logs: this.searchLogs(undefined, '', 100),
      deployments: this.getRecentDeployments(),
      deploymentDiff: clone(deploymentDiff),
      timeline: [...initialTimeline, ...this.customTimeline].map(clone),
      remediation: {
        restartAttempts: this.restartAttempts,
        rollbackApplied: this.rolledBack,
        activeRevision: activeCheckoutRevision,
      },
      recovery: this.verifyRecovery(),
    };
  }

  private revisionFor(service: ServiceName): string {
    return this.getServiceHealth(service)[0]!.revision;
  }
}
