# FailSafe Three-Minute Demo Runbook

## Before recording

1. Start the incident lab:

   ```bash
   pnpm install
   pnpm check
   pnpm start
   ```

2. Configure Daytona under **TrueForge Settings → Sandbox providers**, then start the tested TrueForge release in another terminal:

   ```bash
   npx @truefoundry/trueforge@0.1.4 --port 8790
   ```

3. Add any supported model provider in TrueForge Settings. The checked-in manifest defaults to `openrouter/gemini-2.5-flash`; override it without editing files:

   ```bash
   FAILSAFE_MODEL=provider/model pnpm trueforge:configure
   ```

4. Open the two local surfaces:

   - Incident console: <http://localhost:3100>
   - TrueForge: <http://localhost:8790>

5. Reset the deterministic fixture:

   ```bash
   pnpm demo:reset
   ```

## Prompt

```text
Investigate synthetic incident INC-2048. Use exactly three parallel subagents for telemetry, deployment causality, and remediation safety. Use the sandbox for one correlation calculation. Gather evidence, choose the smallest safe action, then initiate the exact remediation tool call so TrueForge creates a real approval gate. Do not claim recovery until measured verification passes.
```

## Recording sequence

### 0:00–0:20, stakes

Show the FailSafe dashboard in its initial red state. Call out the 27.4% checkout 5xx rate, 2.42-second p95, 198 of 200 database connections, and active rc3 deployment.

### 0:20–0:55, evidence

Move to TrueForge. Submit the prompt. Show real MCP calls for the incident brief, service health, metrics, logs, deployments, and diff.

### 0:55–1:20, delegation

Show the three child threads. The telemetry, deployment, and safety subagents must return evidence, confidence, and disconfirming evidence.

### 1:20–1:40, sandbox

Show the sandbox creation and Python correlation output. The calculation must tie the 14:02 deployment to the 14:04 failure window.

### 1:40–2:05, human gate

Show the exact `rollback_deployment` tool call. Confirm that the turn contains `tool.approval_required` and that the lab is still on rc3. Reload the TrueForge page and reopen the same session before approving.

### 2:05–2:35, remediation

Approve the exact rollback to `checkout-api@2026.08.26-rc2`. Show the MCP tool response and dashboard transition.

### 2:35–2:55, proof

Show `verify_recovery`: 0.4% 5xx, 196ms p95, 84 database connections, and rc2 active. All samples must be timestamped after the 14:11 rollback.

### 2:55–3:00, close

End on: **FailSafe is the incident-response agent you can trust with root.**

## Acceptance checks

- Dashboard begins `investigating` on rc3.
- Three dynamic subagent threads are visible.
- A sandbox is created and executes generated code.
- The mutation is blocked by a real approval object, not text that says "awaiting approval."
- Reload preserves the same session and pending approval.
- Approval executes exactly one validated rollback.
- Recovery verification returns `verified=true` from post-rollback samples.
- Dashboard ends `resolved` on rc2.
