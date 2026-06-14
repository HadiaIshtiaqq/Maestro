# NEXUS — lablab.ai Submission Package

Band of Agents Hackathon · Track 3 (Regulated & High-Stakes Workflows)
Fill these into the lablab.ai submission form. Everything here is grounded in
what the code actually does (verified in live runs) — no claims the demo can't back up.

---

## Project Title
**NEXUS — Governed Multi-Agent Incident Response, Coordinated Through Band**

## Short Description (one line)
A band of 11 specialized agents and a human commander triage, investigate, and
resolve enterprise incidents inside a shared Band room — with a policy-enforced
human approval gate on every high-severity action and a full compliance audit trail.

## Long Description
Enterprise incident response is collaborative and high-stakes: a security breach
or outage pulls in correlation, validation, severity, allocation, mitigation, and
communications specialists, all coordinating under time pressure while a human
commander stays accountable for irreversible actions.

NEXUS runs this as a multi-agent system where **Band is the coordination layer**,
not a notification afterthought. Every incident opens a per-incident Band room.
Agents join, post structured findings, and hand off context through the room:
Intake → Correlation/Dedup → Validation → Classification → Severity. The Incident
Commander then **dynamically recruits** the Phase-2 response team (Allocation,
Dependency-Impact, Mitigation, Runbook) based on assessed severity, and posts a
proposal or — for SEV-1/SEV-2 — an `approval_request` that **blocks** until the
Human Commander approves or vetoes. Approval authority is enforced as a
separation-of-duties rule: agents cannot approve their own proposals.

What makes it Track-3-grade:
- **Policy-enforced human-in-the-loop.** SEV-1/SEV-2 incidents *always* require
  human approval — the LLM can request the gate for lower severities but cannot
  opt a high-severity incident out of it. Unapproved actions auto-veto after 5
  minutes or a server restart.
- **Immutable-style audit trail.** Every Band message is mirrored to MongoDB
  before it is considered posted; rooms rehydrate on restart; `/api/band/audit-trail/:id`
  exports the full trail for a regulator.
- **Cross-framework by design.** Agents run across multiple AI providers
  (Claude, Gemini, AI/ML API, Featherless) and every Band message is labeled with
  the engine that produced it — the collaboration spans frameworks, visibly.
- **Resilience under contention.** A shared on-call pool is contended across
  concurrent incidents; higher-priority incidents reclaim responders from lower
  ones, and the loss is posted into the victim incident's room.

## Technology & Category Tags
`multi-agent` · `band` · `incident-response` · `human-in-the-loop` · `governance`
· `cross-framework` · `compliance` · `cybersecurity` · `typescript` · `react`

---

## Demo Video Script (~3 min) — reproducible from a single run

> Verified run: a ransomware SIEM signal → SEV-2 → policy-forced gate → human
> approval → audit export, end-to-end in ~90s.

1. **The problem (0:00–0:25).** "When a ransomware alert fires, a dozen
   specialists scramble. NEXUS runs that response as a band of agents coordinating
   through Band — with a human commander accountable for every irreversible move."

2. **Signal → room opens (0:25–0:55).** POST the ransomware signal. Cut to the
   Band Room tab: the room opens, 11 agents join, findings stream in live. Point at
   the **engine badges** — "these agents are running on different AI frameworks,
   collaborating in one room."

3. **Dynamic recruitment + severity (0:55–1:30).** Show the Commander assess
   SEV-2 and recruit the Phase-2 team. "The commander pulled in allocation,
   dependency-impact, mitigation, and runbook agents — only after severity was
   confirmed."

4. **The governance gate (1:30–2:20).** The `approval_request` appears, flagged
   NEEDS HUMAN APPROVAL, tagged `policy (severity-based)`. "This is the key move:
   SEV-2 forces a human gate — the AI cannot skip it. The pipeline is blocked."
   Click **Approve** as Human Commander. Comms agent runs, incident goes active.

5. **The audit trail (2:20–2:50).** Open `/api/band/audit-trail/:id`. "Every
   message, every agent, the human approval with notes and timestamp — one export,
   regulator-ready."

6. **Close (2:50–3:00).** "Eleven agents, four AI frameworks, one Band room, one
   accountable human. That's governed multi-agent incident response."

## Slide Outline (7 slides)
1. Title + one-line pitch + Track 3.
2. The problem: incident response is collaborative, high-stakes, audited.
3. Architecture diagram: signal → Band room → phases → approval gate → audit.
4. Band as the coordination layer (rooms, recruitment, authority rules) — the
   judging-criterion-1 slide.
5. Governance: policy-forced approval, auto-veto, separation of duties.
6. Cross-framework: the engine-labeled timeline screenshot + partner APIs.
7. Business value: MTTR, compliance export, safety-by-default. Live demo URL + repo.

---

## Submission Checklist (status)
- [ ] Public GitHub repo — **rotate leaked secrets first**, then push
- [ ] Demo application URL — deploy to Cloud Run (`deploy.ps1`, set OPERATOR_API_KEY + CORS_ORIGIN)
- [ ] Video presentation — script above
- [ ] Slide presentation — outline above
- [ ] Cover image
- [x] Project title / short / long description / tags — above
- [ ] Band integration verified on the real platform (`BAND_USE_SDK=true` + kickoff creds)

## Partner-prize angle
Route the dependency-impact and runbook agents through AI/ML API and Featherless
(already wired via `OpenAICompatAgent`) to qualify for "Best Use of AI/ML API"
($1,000 cash + $1,000 credits) and the Featherless prize — far smaller pools than
the main track.
