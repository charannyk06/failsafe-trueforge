# Judges' Guide

FailSafe is a TrueForge incident commander for one narrow, high-stakes job: diagnose a checkout outage, earn permission for the smallest safe remediation, and prove recovery from measurements taken after the action.

## 60-second evaluation path

1. Watch the [three-minute demo](https://youtu.be/WHKEKvfC-dI).
2. Inspect the checked-in [`failsafe-commander` manifest](../trueforge/failsafe-agent.json).
3. Inspect the [ten MCP tools and policy annotations](../src/mcp/tool-definitions.ts).
4. Run `pnpm install && pnpm check`.
5. Follow the [reproducible demo runbook](demo-runbook.md).

## Equal-weight judging scorecard

| Criterion | What FailSafe demonstrates | Fastest evidence |
|---|---|---|
| Potential impact | Incident responders get an evidence-backed control loop instead of a model that declares success after calling a tool. | [Demo 0:00 to 0:20](https://youtu.be/WHKEKvfC-dI), [incident model](../src/incident/incident-store.ts) |
| Creativity and originality | Authority is earned in stages: observe, delegate, calculate, ask, act, verify. Recovery is a measured predicate, not model prose. | [Demo 1:40 to 2:59](https://youtu.be/WHKEKvfC-dI), [`verify_recovery`](../src/mcp/tool-definitions.ts) |
| Technical excellence | Strict TypeScript, deterministic state transitions, live Streamable HTTP MCP coverage, loopback binding, monotonic evidence timing, CI, and 17 automated tests. | [CI workflow](../.github/workflows/ci.yml), [tests](../tests/) |
| Sponsor tools | TrueForge owns the saved agent, MCP connector, sandbox, dynamic subagents, approval policy, session continuity, and recovery turn. | [Demo 0:20 to 2:35](https://youtu.be/WHKEKvfC-dI), [configuration script](../scripts/configure-trueforge.mjs) |
| Control and safety | Generated code runs in a sandbox. Write and destructive tools stop for approval. Rollback validates exact targets and is idempotent. Recovery requires post-action evidence. | [Threat model](threat-model.md), [demo 1:20 to 2:55](https://youtu.be/WHKEKvfC-dI) |
| Presentation | One synthetic incident tells the whole story, with real TrueForge evidence, authored captions, a live state transition, and no private data. | [Demo video](https://youtu.be/WHKEKvfC-dI), [runbook](demo-runbook.md) |

## Best Use of TrueForge qualification proof

| Required harness behavior | Visible proof |
|---|---|
| Real tools through MCP | Ten classified tools, exercised over Streamable HTTP; demo at 0:20 |
| Generated code in a sandbox | Python correlation calculation; demo at 1:20 |
| Human approval before irreversible action | Real `tool.approval_required` event before rollback; demo at 1:40 |
| Work handed to subagents | Three bounded dynamic subagents in parallel; demo at 0:55 |
| Session survives reconnects | Same session and pending approval are reopened before approval; demo at 1:40 |
| TrueForge is central | Removing TrueForge removes delegation, sandboxing, approval policy, session history, and recovery orchestration |

## Deterministic incident

The fixture starts on `checkout-api@2026.08.26-rc3`. Six replicas each request a database pool of 80 connections, creating potential demand for 480 connections against a 200-connection Postgres ceiling. A restart preserves rc3 and cannot recover. A validated rollback to rc2 restores the known-good configuration. Verification then checks four post-rollback gates:

- checkout 5xx at 0.4%
- p95 latency at 196ms
- 84 active database connections
- active revision `checkout-api@2026.08.26-rc2`

## Reproducibility boundary

All incident data is deterministic and explicitly synthetic. The server binds to `127.0.0.1`. The repository contains no model credentials, production data, or private paths. Judges can reproduce the entire state machine, MCP protocol behavior, and UI transition locally without access to an external account.

## Public evidence

- Repository: <https://github.com/charannyk06/failsafe-trueforge>
- Representative pull request: <https://github.com/charannyk06/failsafe-trueforge/pull/1>
- Demo: <https://youtu.be/WHKEKvfC-dI>
- Qodo trail: the README section is finalized after the required review and follow-up review complete on PR #1.
