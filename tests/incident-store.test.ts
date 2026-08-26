import { describe, expect, it } from 'vitest';
import {
  BAD_DEPLOYMENT_ID,
  BAD_REVISION,
  IncidentStore,
  STABLE_REVISION,
} from '../src/incident/incident-store.js';

describe('IncidentStore', () => {
  it('starts with a coherent active SEV-1 incident', () => {
    const store = new IncidentStore();
    const snapshot = store.snapshot();

    expect(snapshot.incident).toMatchObject({
      id: 'INC-2048',
      severity: 'SEV-1',
      status: 'investigating',
    });
    expect(snapshot.remediation).toEqual({
      restartAttempts: 0,
      rollbackApplied: false,
      activeRevision: BAD_REVISION,
    });
    expect(snapshot.recovery.verified).toBe(false);
    expect(snapshot.services.find(service => service.service === 'checkout-api')).toMatchObject({
      status: 'critical',
      revision: BAD_REVISION,
    });
  });

  it('correlates the bad deployment with connection exhaustion evidence', () => {
    const store = new IncidentStore();

    expect(store.getDeploymentDiff(BAD_DEPLOYMENT_ID)).toMatchObject({
      baseRevision: STABLE_REVISION,
      candidateRevision: BAD_REVISION,
    });
    expect(store.searchLogs('checkout-api', 'pool exhausted')).toHaveLength(1);
    expect(store.queryMetrics('postgres_active_connections')[0]?.points.at(-1)?.value).toBe(197);
  });

  it('shows why a restart is insufficient', () => {
    const store = new IncidentStore();
    const result = store.restartService('checkout-api', 'Attempt recovery without changing revisions');

    expect(result).toMatchObject({
      status: 'completed_without_recovery',
      activeRevision: BAD_REVISION,
      incidentRecovered: false,
    });
    expect(store.snapshot().remediation.restartAttempts).toBe(1);
    expect(store.verifyRecovery().verified).toBe(false);
  });

  it('rolls back once, verifies every recovery gate, and remains idempotent', () => {
    const store = new IncidentStore();
    const input = {
      service: 'checkout-api' as const,
      deploymentId: BAD_DEPLOYMENT_ID,
      targetRevision: STABLE_REVISION,
      reason: 'rc3 multiplied connection demand beyond the database ceiling',
    };

    expect(store.rollbackDeployment(input)).toMatchObject({
      status: 'completed',
      fromRevision: BAD_REVISION,
      toRevision: STABLE_REVISION,
      incidentRecovered: true,
    });
    const recovery = store.verifyRecovery();
    expect(recovery.verified).toBe(true);
    expect(recovery.checks).toHaveLength(4);
    expect(recovery.checks.every(check => check.passed)).toBe(true);
    const postRollbackSamples = store.queryMetrics().map(series => series.points.at(-1)?.timestamp);
    expect(postRollbackSamples.every(timestamp => timestamp !== undefined)).toBe(true);
    for (const timestamp of postRollbackSamples) {
      expect(new Date(timestamp!).getTime()).toBeGreaterThan(new Date('2026-08-26T14:11:00.000Z').getTime());
      expect(new Date(timestamp!).getTime()).toBeLessThan(new Date(recovery.checkedAt).getTime());
    }
    expect(store.snapshot().incident.status).toBe('resolved');
    expect(store.rollbackDeployment(input).status).toBe('already_completed');
  });

  it('refuses an unsafe rollback target and resets deterministically', () => {
    const store = new IncidentStore();

    expect(() =>
      store.rollbackDeployment({
        service: 'checkout-api',
        deploymentId: BAD_DEPLOYMENT_ID,
        targetRevision: 'checkout-api@unknown',
        reason: 'unsafe target supplied for test',
      }),
    ).toThrow(`target must be the last known-good revision ${STABLE_REVISION}`);

    store.restartService('checkout-api', 'Mutate the lab before reset');
    const reset = store.reset();
    expect(reset.remediation).toEqual({
      restartAttempts: 0,
      rollbackApplied: false,
      activeRevision: BAD_REVISION,
    });
  });
});
