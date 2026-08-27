/* global console, fetch, process */

const baseUrl = (process.env.FAILSAFE_URL ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
const response = await fetch(`${baseUrl}/api/reset`, { method: 'POST' });

if (!response.ok) {
  throw new Error(`FailSafe reset failed with HTTP ${response.status}`);
}

const snapshot = await response.json();
console.log(
  JSON.stringify(
    {
      incidentId: snapshot.incident.id,
      status: snapshot.incident.status,
      activeRevision: snapshot.remediation.activeRevision,
      reset: true,
    },
    null,
    2,
  ),
);
