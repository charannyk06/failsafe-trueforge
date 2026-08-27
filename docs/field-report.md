# Building the Incident Agent We Would Trust With Root

A chatbot can tell an operator to roll back a deployment. An incident agent can call the rollback tool itself. That difference is exactly where the interesting engineering starts.

FailSafe is our Agent Harness Hackathon entry. It uses TrueForge to investigate a deterministic synthetic checkout outage, delegate bounded investigations, run generated analysis code in a sandbox, stop before remediation, and verify recovery from measurements taken after the action.

## The job we gave the agent

The incident is intentionally narrow. Release candidate three increases each checkout replica's database pool from 20 to 80 connections and reduces the acquisition timeout to 250 milliseconds. Six replicas can demand 480 connections from a Postgres instance capped at 200. Errors, latency, saturation, and conversion all degrade.

A restart is plausible but wrong because it preserves the faulty configuration. The smallest safe action is a rollback to the last known-good revision. The agent must prove that diagnosis, request approval for the exact rollback, execute it once, and then prove recovery.

## Why a harness matters

The model is only one component. TrueForge provides the control plane around it:

1. **MCP connectivity** exposes ten purpose-built incident tools.
2. **Dynamic subagents** split telemetry, deployment causality, and remediation safety into bounded lanes.
3. **Sandboxed Code Mode** executes one generated Python correlation calculation in Daytona without host access.
4. **Tool policy** blocks the three human-controlled mutation tools for approval while allowing deterministic verification to record its audit result.
5. **Session history** preserves the investigation and approval state across reconnects.
6. **Post-action orchestration** keeps the same session alive long enough to verify recovery.

Without those features, FailSafe becomes a prompt that recommends a rollback. With them, it becomes a controlled operational loop.

## Proof-carrying remediation

The central design idea is that authority should accumulate with evidence.

```text
observe -> delegate -> calculate -> ask -> act -> verify
```

Each stage produces proof needed by the next. The parent agent cannot responsibly choose remediation until its subagents return evidence and disconfirming evidence. The rollback does not execute until the operator approves the exact tool call. The incident is not resolved until four post-action gates pass.

This prevents a common agent failure mode: converting a successful tool response into an unsupported claim that the system is healthy.

## What broke while we built it

The review loop found several issues that looked small but weakened the safety story:

- Recovery metrics originally carried timestamps from before rollback. The fixture now emits a dedicated post-rollback series, and tests prove each sample is newer than the action.
- Early tests exercised MCP in memory but did not cover the deployed Streamable HTTP path. A client-transport integration test now discovers and calls tools through `/mcp`.
- Qodo found that rollback alone marked the incident resolved. Resolution is now gated on an explicit `verify_recovery` call, with monotonic action and verification timestamps.
- Qodo also tightened the transport contract: malformed MCP JSON returns JSON-RPC `-32700`, every non-POST method returns `405`, and the documented runtime now matches TrueForge's Node.js 22 prerequisite.
- A later security pass caught that `verify_recovery` was labeled read-only even though it records successful verification. It is now truthfully classified as an idempotent audit write, the approval policy names the three human-controlled mutations explicitly, and tests assert the entire tool-policy matrix plus read-tool immutability.
- The clean-machine path previously omitted TrueForge's required sandbox provider. The runbook now pins TrueForge `0.1.4`, names Daytona as a prerequisite, and the configuration script fails fast when Daytona is missing.
- An independent security pass found that hostile browser Origins could reach the loopback mutation surface. Host and Origin checks now run before JSON parsing and have regression coverage.
- The first server bound to every interface. It now binds to loopback and rejects non-loopback Host values.
- Custom audit events could move backward in time after a fixed rollback event. Timeline writes now advance monotonically using date arithmetic.
- The initial dashboard label implied the browser was an MCP client. It now says `LAB API ONLINE`, matching the actual architecture.

These fixes made the implementation more honest, not merely more polished.

## The safety boundary

All incident data is synthetic. The MCP server is loopback-only. Six read tools are state-preserving. Human-controlled timeline, restart, and rollback mutations require approval. Recovery verification is an idempotent audit write that cannot alter service configuration. Rollback validates the exact service, deployment, and target revision, and repeating an approved rollback is idempotent. Generated code runs in Daytona through TrueForge. Credentials remain outside the repository.

The project does not claim that a model should receive unrestricted production access. It demonstrates how a harness can narrow authority to one evidence-backed, human-approved operation.

## How to reproduce it

```bash
pnpm install
pnpm check
pnpm start
```

Start TrueForge `0.1.4` separately, configure any supported model provider plus Daytona, run `FAILSAFE_MODEL=provider/model pnpm trueforge:configure`, and follow the [three-minute runbook](demo-runbook.md).

The fixture always starts degraded on rc3. It always rejects unsafe rollback targets. Restart never recovers it. The valid rollback produces post-action metrics and a resolved dashboard on rc2. Twenty-three automated tests cover the state machine, complete MCP annotation matrix, read-tool immutability, TrueForge manifest contract, Streamable HTTP transport, server boundary, static UI, timing, audit ordering, and a behavioral Daytona success path through agent creation.

## What the demo shows

The [three-minute demo](https://youtu.be/WHKEKvfC-dI) shows real TrueForge evidence rather than a reconstructed chat UI:

- 0:20, MCP tools gather incident evidence
- 0:55, three dynamic subagents investigate in parallel
- 1:20, generated code runs in the sandbox
- 1:40, TrueForge blocks the exact rollback call for approval
- 2:05, the approved rollback executes
- 2:35, four post-action gates verify recovery

FailSafe is the incident-response agent we would trust with root because the model never holds that trust by itself. The harness makes it earn each step.

## Links

- [Public repository](https://github.com/charannyk06/failsafe-trueforge)
- [Pull request](https://github.com/charannyk06/failsafe-trueforge/pull/1)
- [Demo video](https://youtu.be/WHKEKvfC-dI)
- [Judges' guide](judges-guide.md)
- [Threat model](threat-model.md)

## AI tool-use disclosure

AI coding agents assisted with research, planning, implementation, review, and documentation. Every generated artifact was inspected, executed, tested, and corrected against real runtime output. The project does not claim production connectivity, customer data, or fabricated recovery evidence.
