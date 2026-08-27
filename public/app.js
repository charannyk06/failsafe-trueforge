/* global console, document, fetch, setInterval */

const connection = document.querySelector('#connection-status');
const resetButton = document.querySelector('#reset-button');
const metricGrid = document.querySelector('#metric-grid');
const serviceRows = document.querySelector('#service-rows');
const timeline = document.querySelector('#timeline');

const metricNames = {
  checkout_http_5xx_rate_percent: 'Checkout 5xx rate',
  checkout_p95_latency_ms: 'Checkout p95',
  checkout_success_rate_percent: 'Checkout success',
  postgres_active_connections: 'DB connections',
};

const units = {
  percent: '%',
  milliseconds: 'ms',
  connections: '',
};

function formatTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(new Date(value)) + 'Z';
}

function metricPath(points, width = 280, height = 56) {
  if (!points.length) return '';
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const y = height - 5 - ((point.value - min) / range) * (height - 10);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function thresholdText(series) {
  const operator = series.thresholdDirection === 'above' ? '<' : '>';
  return `SLO ${operator} ${series.threshold}${units[series.unit]}`;
}

function renderMetrics(state) {
  metricGrid.replaceChildren();
  for (const series of state.metrics) {
    const latest = series.points.at(-1)?.value ?? 0;
    const article = document.createElement('article');
    article.className = `metric${state.recovery.verified ? ' recovered' : ''}`;

    const top = document.createElement('div');
    top.className = 'metric-top';
    const name = document.createElement('span');
    name.className = 'metric-name';
    name.textContent = metricNames[series.metric] ?? series.label;
    const threshold = document.createElement('span');
    threshold.className = 'metric-threshold';
    threshold.textContent = thresholdText(series);
    top.append(name, threshold);

    const value = document.createElement('strong');
    value.className = 'metric-value';
    value.textContent = `${latest}${units[series.unit]}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 280 56');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('metric-chart');
    const baseline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    baseline.setAttribute('x1', '0'); baseline.setAttribute('x2', '280');
    baseline.setAttribute('y1', '55'); baseline.setAttribute('y2', '55');
    baseline.classList.add('baseline');
    const trend = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trend.setAttribute('d', metricPath(series.points));
    trend.classList.add('trend');
    svg.append(baseline, trend);
    article.append(top, value, svg);
    metricGrid.append(article);
  }
}

function renderServices(state) {
  serviceRows.replaceChildren();
  for (const service of state.services) {
    const row = document.createElement('div');
    row.className = 'service-row';
    row.setAttribute('role', 'row');
    for (const text of [service.service, service.revision, service.replicasReady]) {
      const cell = document.createElement('span');
      cell.setAttribute('role', 'cell');
      cell.textContent = text;
      row.append(cell);
    }
    const status = document.createElement('span');
    status.setAttribute('role', 'cell');
    status.className = `service-state ${service.status}`;
    status.textContent = service.status;
    row.append(status);
    serviceRows.append(row);
  }
}

function renderDiff(state) {
  document.querySelector('#deployment-id').textContent = state.deploymentDiff.deploymentId;
  document.querySelector('#deployment-summary').textContent = state.deploymentDiff.summary;
  const files = document.querySelector('#diff-files');
  files.replaceChildren();
  for (const file of state.deploymentDiff.files) {
    const wrapper = document.createElement('div');
    wrapper.className = 'diff-file';
    const path = document.createElement('div');
    path.className = 'diff-path';
    path.textContent = file.path;
    const pre = document.createElement('pre');
    for (const line of file.patch.split('\n')) {
      const span = document.createElement('span');
      span.textContent = `${line}\n`;
      if (line.startsWith('+')) span.className = 'add';
      if (line.startsWith('-')) span.className = 'remove';
      pre.append(span);
    }
    wrapper.append(path, pre);
    files.append(wrapper);
  }
}

function renderTimeline(state) {
  timeline.replaceChildren();
  for (const event of state.timeline) {
    const row = document.createElement('div');
    row.className = 'timeline-row';
    row.dataset.kind = event.kind;
    for (const [className, text] of [
      ['timeline-time', formatTime(event.timestamp)],
      ['timeline-kind', event.kind],
      ['timeline-summary', event.summary],
      ['timeline-evidence', event.evidence ?? event.actor],
    ]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      row.append(span);
    }
    timeline.append(row);
  }
}

function renderStages(state) {
  const resolved = state.incident.status === 'resolved';
  const stageStates = resolved
    ? { detect: 'complete', investigate: 'complete', approve: 'complete', remediate: 'complete', verify: 'complete' }
    : { detect: 'complete', investigate: 'active', approve: '', remediate: '', verify: '' };
  for (const item of document.querySelectorAll('#run-stages li')) {
    item.classList.remove('complete', 'active');
    const value = stageStates[item.dataset.stage];
    if (value) item.classList.add(value);
  }

  const barrier = document.querySelector('#approval-barrier');
  const title = document.querySelector('#approval-title');
  const copy = document.querySelector('#approval-copy');
  barrier.classList.toggle('approved', resolved);
  title.textContent = resolved ? 'Rollback approved + executed' : 'Rollback locked';
  copy.textContent = resolved
    ? 'The operator approved the exact rollback. TrueForge executed it and preserved the decision in the session ledger.'
    : 'TrueForge must receive explicit operator approval before the destructive tool can execute.';
}

function render(state) {
  const resolved = state.incident.status === 'resolved';
  document.body.dataset.incidentState = state.incident.status;
  document.querySelector('#incident-id').textContent = state.incident.id;
  document.querySelector('#incident-title').textContent = state.incident.title;
  document.querySelector('#customer-impact').textContent = state.incident.customerImpact;
  const status = document.querySelector('#incident-status');
  status.textContent = state.incident.status.toUpperCase();
  status.classList.toggle('resolved', resolved);
  document.querySelector('#incident-time').textContent = resolved
    ? `Resolved ${formatTime(state.incident.resolvedAt)}`
    : `Started ${formatTime(state.incident.startedAt)}`;

  renderMetrics(state);
  renderServices(state);
  renderDiff(state);
  renderStages(state);
  renderTimeline(state);
  document.querySelector('#last-updated').textContent = `STATE SYNC ${formatTime(new Date().toISOString())}`;
}

async function syncState() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
    connection.className = 'connection online';
    connection.innerHTML = '<span class="pulse" aria-hidden="true"></span>LAB API ONLINE';
  } catch (error) {
    connection.className = 'connection offline';
    connection.innerHTML = '<span class="pulse" aria-hidden="true"></span>LAB API OFFLINE';
    console.error('FailSafe state sync failed', error);
  }
}

resetButton.addEventListener('click', async () => {
  resetButton.disabled = true;
  resetButton.textContent = 'Resetting…';
  try {
    const response = await fetch('/api/reset', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    console.error('FailSafe reset failed', error);
  } finally {
    resetButton.disabled = false;
    resetButton.textContent = 'Reset scenario';
  }
});

await syncState();
setInterval(syncState, 1500);
