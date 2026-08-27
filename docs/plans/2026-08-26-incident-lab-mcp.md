# FailSafe Incident Lab Implementation Plan

> **For Hermes:** Implement this plan task-by-task without committing.

**Goal:** Ship a deterministic, locally runnable incident lab with a polished dashboard and a real Streamable HTTP MCP server for a TrueForge hackathon demo.

**Architecture:** One Express process on port 3100 owns an in-memory `IncidentLab`, serves a static dashboard, exposes reset/state JSON endpoints, and connects a stateless MCP transport at `/mcp`. The lab starts degraded, a restart cannot heal it, and only a validated rollback transitions it to healthy.

**Tech Stack:** Node.js, TypeScript, pnpm, Express, `@modelcontextprotocol/sdk`, Zod, Vitest, ESLint.

---

1. Scaffold strict ESM TypeScript, linting, build, dev, test, and reset scripts.
2. Implement deterministic incident state, evidence queries, restart, rollback, and verification.
3. Register ten tools with exact MCP annotations and serve them over Streamable HTTP.
4. Build a responsive polling dashboard that visibly follows degraded → healthy state.
5. Add a TrueForge agent manifest and a three-minute reproducible demo runbook.
6. Test state transitions, annotations, HTTP JSON-RPC, destructive behavior, and recovery.
7. Run install, lint, typecheck, tests, build, live HTTP/MCP smoke tests, and a secrets audit.
