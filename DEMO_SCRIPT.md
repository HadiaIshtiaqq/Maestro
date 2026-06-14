# Maestro — Demo Runbook (video + slides)

Live URL: https://maestro-backend-1010212017317.us-central1.run.app
Band: https://app.band.ai  ·  Operator key: FZ0ophNf2uh1VTLbkKITsSHKPn8QLkTJ

## 0. Pre-recording setup (do this BEFORE you hit record)

Prod runs ~5–6 min per incident, so you must NOT fire a cold incident on camera.

1. **Two windows side by side:** left = Maestro dashboard, right = the Band chat (app.band.ai → Chats).
2. **Warm up** the server: open the dashboard once (first hit has a ~10s cold start).
3. **Reset to a clean board** (terminal):
   ```
   curl -X POST https://maestro-backend-1010212017317.us-central1.run.app/api/admin/reset-demo \
     -H "x-operator-key: FZ0ophNf2uh1VTLbkKITsSHKPn8QLkTJ" -H "Content-Type: application/json" -d '{}'
   ```
4. **Pre-fire ONE incident ~4 min before recording**, so by the time you record it has reached the approval gate and its Band chat is full:
   ```
   curl -X POST https://maestro-backend-1010212017317.us-central1.run.app/api/ingest-signal \
     -H "Content-Type: application/json" \
     -d '{"source":"siem","type":"ransomware","data":{"alert":"Ransomware encryption on 3 prod file servers","service":"file-storage"},"urgency":10}'
   ```
   (Use the synchronous form — no `"async"` — so the response confirms it landed.)
5. Confirm `BAND_ALLOW_AGENT_APPROVAL=false` so only YOU can approve. (It is, in the deployed env.)
6. Open OBS / Loom / screen recorder. Record in SEGMENTS (slides, then demo) and stitch — don't do one nervous take.

## 1. Slide deck (7 slides) + the demo woven in

Build the deck in Google Slides / PowerPoint / Canva. Present in full-screen
(presenter mode). Move forward with → / Space, back with ←. Use a clicker if you
have one. When a slide says "CUT TO DEMO", alt-tab to the browser; when done,
alt-tab back and continue.

| # | Slide | Say (≈) | On screen |
|---|---|---|---|
| 1 | **Title** — "Maestro: Governed Multi-Agent Incident Response, Coordinated through Band" + your name + Track 3 | "When a security or outage incident hits, a dozen specialists scramble. Maestro runs that response as a band of agents coordinating through Band — with a human who holds the only key to irreversible actions." | Logo, one-line pitch |
| 2 | **The problem** | "Incident response is collaborative, high-stakes, and audited. Agents today work alone. The hard part isn't one smart agent — it's many agents coordinating, with a human accountable." | 3 bullets |
| 3 | **Architecture** | "A signal opens a per-incident Band room. Agents post findings, hand off context, the commander recruits a response team, then asks a human to approve. Everything mirrors to an audit trail." | signal → Band room → phases → gate → audit diagram |
| 4 | **Band as the coordination layer** *(the criterion-#1 slide)* → **CUT TO DEMO part A** | (see Demo A below) | live app |
| 5 | **Governance: human-in-the-loop** → **CUT TO DEMO part B** | (see Demo B below) | live app + Band |
| 6 | **Cross-framework + audit** | "Four AI frameworks in one room — Claude, Gemini, AI/ML API, Featherless — each message labeled with the engine that produced it. And every message is in a tamper-evident hash chain, exportable for a regulator." | engine-labeled timeline screenshot + audit export |
| 7 | **Business value + close** | "Faster MTTR, safety by default, a compliance-ready trail — and it's live: here's the URL and the repo." | metrics, live URL, GitHub link |

## DEMO A (during slide 4) — Band is the coordination layer  (~50s)
1. Maestro dashboard → click your pre-fired ransomware incident → **Band Room** tab.
2. Point at the findings streaming in. "Eleven agents — intake, correlation, validation, severity — each posting to the room." Point at the **engine badges**: "these run on different AI frameworks."
3. **Now the proof.** Alt-tab to **app.band.ai → the incident's chat**. "This isn't our UI faking it — this is the *real* Band platform." Point at the distinct senders: **NEXUS** (intel findings), **Maestro-Response** (response phase), **maestro** (commander). "Three distinct agents collaborating in a real Band chat."

## DEMO B (during slide 5) — the human holds the key  (~60s, the money shot)
1. In the Band chat, scroll to the commander's **`approval_request`**: "⛔ HUMAN COMMANDER: reply approve or veto."
2. "This is a SEV-1 — Maestro's policy forces a human gate. The AI cannot skip it." 
3. **Type `approve` in the Band chat as yourself and send it.**
4. Alt-tab to the Maestro dashboard. Within ~5s the gate releases — the incident goes **active**, comms run. "Maestro read my approval back *from Band* and released the gate. The decision happened *inside* Band."
5. (Optional) open `…/api/band/audit-trail/<incidentId>` in a tab: "approved by human-commander, via Band — full trail, regulator-ready."

## 2. Timing target (~3 min total)
- Slides 1–3: 45s  ·  Slide 4 + Demo A: 50s  ·  Slide 5 + Demo B: 60s  ·  Slides 6–7: 30s.

## 3. Recording the transitions (how to move between slides ↔ demo)
- **Within slides:** → / Space forward, ← back. Presenter mode hides the editor.
- **Slide → live app:** Alt+Tab (Win) to the browser window you pre-positioned. Practice the alt-tab order so the right window comes up first.
- **Two-window demo:** keep dashboard and Band chat as two windows; Alt+Tab swaps them. Or snap them side-by-side (Win+←, Win+→) and just move the cursor.
- **Cleanest result:** record each slide's narration and each demo segment separately, then stitch in any editor (CapCut/Clipchamp/iMovie). This lets you redo the live approval beat until it's crisp without re-recording the whole thing.
- If the live approval is risky on camera, record Demo B once it succeeds and keep that take.

## 4. Submission fields (lablab.ai)
- Title / short / long description / tags: see SUBMISSION.md
- Repo: https://github.com/HadiaIshtiaqq/Maestro  ·  App URL: the Cloud Run URL above
- Cover image: a screenshot of the global incident map + the Band chat side by side.
