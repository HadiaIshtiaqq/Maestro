# Maestro — Enterprise Critical-Incident Response & Coordination Platform

**Band of Agents Hackathon (lablab.ai) · Track 3 — Regulated & High-Stakes Workflows**

Maestro is a multi-agent platform that turns a storm of raw operational and security signals into a single, governed, fully-traceable incident response — with a band of 11 specialized agents and a human commander coordinating live inside a shared **Band room**.

## Why Maestro (Track 3)

| Requirement | How Maestro delivers |
|---|---|
| ≥3 agents through Band | 11 agents + human commander in one per-incident Band room |
| Regulated / high-stakes | Enterprise: security breaches, outages, data-integrity — DORA/SOC2/HIPAA-style workflows |
| Human-in-the-loop | Human Commander approval is **enforced by policy for SEV-1/SEV-2** (the LLM can request the gate for lower severities but cannot opt out of it); auto-veto on 5-min timeout or server restart |
| Audit trail | Every Band message is mirrored to MongoDB before delivery completes; compliance export at `/api/band/audit-trail/:id`; rooms rehydrate from MongoDB on restart |
| Cross-framework | Validation agent runs **Claude (Anthropic)** when `ANTHROPIC_API_KEY` is set (falls back to Gemini otherwise — the trace records which engine ran); all others Gemini 2.0 Flash |
| Dynamic recruitment | Commander triage recruits the Phase-2 team after severity is confirmed (severity-based policy: SEV-1–3 full team, SEV-4/5 light team) |

## Architecture

```
Signal Sources  ──POST /api/ingest-signal──▶  Intake Agent
                                                    │
                                           opens Band room
                                                    │
        ┌──────────────── BAND ROOM ─────────────────┐
        │  Correlation ─▶ Validation(Claude) ─▶ Classification ─▶ Severity
        │                                    Commander recruits:
        │  Allocation · DepSim · Mitigation · Runbook · Comms
        │                          │
        │              approval_request (requires_human_approval)
        │                          ▼
        │          Human Commander: approve / veto
        │          (msg_type authority rules enforced in the adapter)
        └─────────────────────────────────────────────┘
                │                        │
         MongoDB (audit)         Operator Web View
```

## Quick Start

```bash
npm install
cp .env.example .env        # add GEMINI_API_KEY + MONGODB_URI (+ ANTHROPIC_API_KEY for the Claude agent)
npm run dev                 # starts server + Vite on http://localhost:3000
npx tsx scenarios/demo_runner.ts all   # fires 3 demo scenarios
```

**Operator view:** http://localhost:3000 — select an incident → **Band Room** tab for the live coordination feed and approval gate.

On first privileged action (approve, reset demo, etc.), the dashboard prompts for your **operator key** — the same value as `OPERATOR_API_KEY` in `.env`. It is stored in browser `localStorage` only, never shipped in the JS bundle.

```bash
npm test          # unit + integration tests (Vitest)
npm run lint      # TypeScript strict check
npm run build     # production UI + server bundle
```

### Environment variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Worker agents (Gemini 2.0 Flash) |
| `ANTHROPIC_API_KEY` | Validation agent (Claude). Unset → falls back to Gemini, recorded in the trace |
| `MONGODB_URI` | Incident + audit persistence |
| `JWT_SECRET` | Mobile-user auth. **Required in production** (server refuses to boot without it); dev uses a random per-boot secret |
| `OPERATOR_API_KEY` | Protects approve/veto + operator routes (`x-operator-key` header). **Required in production** (server refuses to boot without it). Enter at runtime in the operator web UI — never bake into the client bundle |
| `VITE_GOOGLE_MAPS_API_KEY` | Dashboard maps (restrict by HTTP referrer) |
| `BAND_USE_SDK`, `BAND_API_URL`, `BAND_API_KEY` | Switch from the mock Band adapter to the real Band platform (credentials from kickoff) |
| `AIML_API_KEY`, `FEATHERLESS_API_KEY` | Cross-framework partner providers (agents fall back to Gemini when unset) |
| `CORS_ORIGIN` | Comma-separated CORS allowlist (unset = open in dev; **set for public hosting**) |
| `LIVE_DATA_POLLING` | `true` enables real GDACS/USGS/Open-Meteo ingestion (off by default — each event runs the full pipeline) |

See [SECURITY.md](SECURITY.md) for operator-key handling, protected routes, and secret rotation.

## Key API Endpoints

```
POST /api/ingest-signal                        Signal intake (Zod-validated, rate-limited; public)
GET  /api/band/rooms/by-incident/:id           Band room + message trail (read)
GET  /api/band/audit-trail/:incidentId         Compliance export (operator key required)
GET  /api/band/approvals/pending               Actions awaiting approval
POST /api/band/approve  { proposalMsgId }      Human Commander approval  (operator key required)
POST /api/band/veto     { proposalMsgId }      Human Commander veto      (operator key required)
POST /api/admin/reset-demo                       Clear board for demo recording (operator key required)
POST /api/verify-status                          Retract / close incident (operator key required)
```

## Demo Scenarios

```bash
npx tsx scenarios/demo_runner.ts single          # credential-stuffing, SEV-2, human approval
npx tsx scenarios/demo_runner.ts false-positive  # conflicting signals → retraction
npx tsx scenarios/demo_runner.ts concurrent      # two incidents, shared SRE pool
```

## Band Integration

The Band integration is isolated behind the `IBandAdapter` interface in [src/band/adapter.ts](src/band/adapter.ts):

- **`MockBandAdapter`** (default) — in-process rooms + authority enforcement + MongoDB mirror. Lets the full workflow run before platform credentials arrive.
- **`BandSdkAdapter`** (`BAND_USE_SDK=true`) — posts into the **real Band Agent API** (`https://app.band.ai/api/v1/agent`, `X-API-Key` auth): `POST /chats` opens a chat per incident, `POST /chats/{id}/messages` posts each finding (structured Maestro envelope rendered into Band's text+@mention message model), `GET /chats/{id}/messages` reads the trail. The local Mock store remains the source of truth for authority enforcement and the audit mirror; Band is the live agent-to-agent coordination backbone on top. Requires an agent `X-API-Key` registered via Band's Human API.

Agent logic, governance rules, and the UI depend only on `IBandAdapter`, so the swap is contained to this one file.

### Authority rules (separation of duties)

| msg_type | Allowed senders |
|---|---|
| `finding`, `status` | any agent |
| `proposal`, `approval_request` | `incident-commander` only |
| `approval` | `human-commander` only |
| `retraction` | `incident-commander`, `human-commander` |

Enforced in `post()`; `approve`/`veto` HTTP routes additionally require the operator key.

## Agent Roster

| Agent | Model | msg_type |
|---|---|---|
| Intake & Normalization | Gemini 2.0 Flash | `status` |
| Correlation & Dedup | Gemini 2.0 Flash | `finding` |
| **Validation & Credibility** | **Claude Sonnet (Anthropic)** — Gemini fallback when no key | `finding` |
| Classification | Gemini 2.0 Flash | `finding` |
| Severity & Blast-Radius | Gemini 2.0 Flash | `finding` |
| Responder Allocation | Gemini 2.0 Flash | `finding` |
| Dependency Impact Sim | Gemini 2.0 Flash | `finding` |
| Mitigation Projection | Gemini 2.0 Flash | `finding` |
| Runbook Advisor | Gemini 2.0 Flash | `finding` |
| Stakeholder Communications | Gemini 2.0 Flash | `finding` |
| **Incident Commander** | Gemini 2.0 Flash | `proposal`, `approval_request` |
| **Human Commander** | — | `approval`, `retraction` |

## Resource Pool

Shared on-call headcount, contended across concurrent incidents ([src/services/resourceManager.ts](src/services/resourceManager.ts)): 12 SREs, 6 security engineers, 4 data engineers, 3 incident commanders, 2 compliance officers. Higher-priority incidents can reclaim units from lower-priority ones; every reallocation is recorded in the trace log. The pool is in-memory (resets on restart) — production would persist it to MongoDB or Redis.

## Failure Behavior (honest mode)

- If the LLM is unreachable after retries, agents return a **clearly marked degraded output** (`degraded: true`, confidence 0.2, "no analysis performed") instead of fabricated analysis, and anything reaching the Commander in degraded mode **forces human approval**.
- If a human approval is not given within 5 minutes, the action is **auto-vetoed** and the incident retracted.
- Band rooms and message logs are rehydrated from MongoDB at boot, so the operator view and audit export survive restarts. Pending approval gates do **not** survive a restart (they time out as vetoes by design).

## Known Limitations

- `MockBandAdapter` is the default until Band platform credentials are wired in (`BAND_USE_SDK=true`).
- The audit trail is mirrored to MongoDB and protected by a **SHA-256 hash chain** per room; export verifies integrity but is not a blockchain or WORM store.
- The "social/traffic feed" panels in the signal-input UI are **AI-generated simulations**, labeled as such in the response.
- Autonomous-action side-effects (PagerDuty paging, Slack war-rooms, SMS retractions) are **simulated** (`simulated: true` on every record) — the decision logic is real, the integrations are demo stand-ins.
- Cross-signal dedup keys on signal `type` within a 15-minute window — two *distinct* incidents of the same type in that window would merge. Production would key on type + affected service.
- Resource pool and approval gates are in-memory; single-node only.
- Operator auth is a shared API key (demo-grade). Production would use per-user identity (SSO/OIDC).
- The Expo mobile app (`mobile/`) is a companion citizen-reporting client and not part of the Track 3 submission scope. Set `EXPO_PUBLIC_API_URL` for LAN development; production builds use `EXPO_PUBLIC_API_URL` if set.

## Cost & Latency

| Component | Per-incident cost | Latency |
|---|---|---|
| Gemini 2.0 Flash × ~11 calls | ~$0.001 (free tier available) | 8–15s end-to-end (sequential) |
| Claude Sonnet (Validation) | ~$0.01 | 1–3s |
| MongoDB Atlas (M0) | $0 | <50ms |

Pipelines for separate incidents run concurrently (`ConcurrentOrchestrator`); steps *within* one pipeline are sequential because each agent consumes the prior agents' context.

## Project Structure

```
Maestro/
├── src/
│   ├── band/
│   │   ├── adapter.ts          # MockBandAdapter + BandSdkAdapter + hash-chain audit
│   │   └── types.ts            # BandMessage, BandRoom, AUTHORITY_RULES, IBandAdapter
│   ├── agents/
│   │   ├── AntigravityCore.ts  # Orchestrators, GeminiAgent, ClaudeAgent
│   │   └── ciroAgents.ts       # 11 registered agents with prompts + JSON schemas
│   ├── services/
│   │   ├── incidentService.ts  # Band-coordinated pipeline + approval gate flow
│   │   ├── approvalService.ts  # Human approval gates (promise-based, 5-min auto-veto)
│   │   ├── resourceManager.ts  # Priority-based shared responder pool
│   │   └── geminiService.ts    # Gemini wrapper: retries, cache, degraded fallbacks
│   ├── lib/
│   │   ├── validationSchemas.ts # Zod schemas for API POST bodies
│   │   └── operatorFetch.ts    # Runtime operator-key client (not baked into bundle)
│   ├── components/             # Operator web UI (BandRoomTimeline = approval gate UI)
│   └── routes/index.ts         # API routes (privileged routes behind OPERATOR_API_KEY)
├── shared/mockIncidents.ts     # Shared mock fixtures (web + mobile)
├── tests/                      # Vitest: band adapter, approval, auth, rate limit
├── scenarios/demo_runner.ts    # 3 hackathon demo scenarios
├── mobile/                     # Expo companion app (out of submission scope)
├── docker-compose.yml          # Local monolith + MongoDB
├── SECURITY.md                 # Secrets, operator key, protected routes
└── server.ts                   # Express + Socket.IO + Band room rehydration
```

## CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every push/PR to `main`:

- `npm run lint` (strict TypeScript)
- `npm test` (37 unit/integration tests)
- `npm run build` (production bundle)

## License

MIT — see [LICENSE](./LICENSE)

## Contributing & security

- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, PR checklist, conventions
- [SECURITY.md](SECURITY.md) — secrets, operator key, protected routes
