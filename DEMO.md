# Publisher — Demo & Deploy Runbook

> The 5-minute demo script + how to stand up the deployed harness (Vercel frontend ↔ local backend via ngrok, per ASSUMPTIONS D11). Pairs with `HARNESS.md` (architecture).

---

## 0. TL;DR — what wins

The harness is graded, and judges remember what they *see*. The demo leads with the two pieces built to be impossible to miss:
1. **Four pillar lanes + the sealed agent box** — pillar separation, visible (R1).
2. **The draft before/after diff** — `VOICE_DRIFT 0.42 → feedback → 0.81 pass`, agent behavior changing from feedback (R2).

The **safest** path renders both live from a deterministic mock with **no backend**: open `/runs/demo`. Use that as the spine; show a real run + the real-research worker swap for depth.

---

## 1. Local bring-up (90 seconds)

```bash
npm install
npm run build                 # shared → backend → frontend
npm run seed --workspace backend   # seeds 2 voice-distinct personas (The Essayist, The Builder)
npm run dev                   # backend :4000 + frontend :3000 (concurrently)
```
- Frontend: http://localhost:3000  · Backend health: http://localhost:4000/health
- Default worker = deterministic, token-free **MockAgent** (no key, no tokens).
- Guaranteed-live demo surface (no backend needed): http://localhost:3000/runs/demo

### Turn on the REAL research agent (real web_search)
```bash
# .env (backend)
USE_REAL_AGENT=true
ANTHROPIC_API_KEY=sk-ant-...
```
Then pick the **"Claude Opus 4.8 (real web research)"** worker (`anthropic-research`) in the start-a-run form. It runs the official `@anthropic-ai/sdk` with the server-side `web_search` tool and returns real source URLs.

---

## 2. Deploy for judges — Vercel frontend ↔ local backend via ngrok (D11)

The harness runs on your machine; judges hit a stable Vercel URL that talks to it through an ngrok tunnel.

**Step 1 — backend local + tunnel**
```bash
npm run seed --workspace backend
npm run dev --workspace backend          # backend on :4000
ngrok http 4000                          # → https://<id>.ngrok-free.app  (copy this)
```

**Step 2 — point the backend at the public URLs** (`.env`, then restart backend)
```bash
CORS_ORIGIN=https://<your-vercel-app>.vercel.app
PUBLIC_BASE_URL=https://<id>.ngrok-free.app    # so published-page URLs resolve through the tunnel
USE_REAL_AGENT=true
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 3 — deploy the frontend to Vercel**
```bash
cd frontend
vercel deploy --prod        # set the project root to ./frontend on first run
# In the Vercel project settings (or CLI prompts) set:
#   NEXT_PUBLIC_API_BASE = https://<id>.ngrok-free.app
```
The frontend (onboarding, run stream, escalation, published preview) is now public; every API call + the published-page iframe resolve to your tunneled backend.

> **Plugin path (north star):** the same ngrok-exposed backend + the swappable `Agent` seam make this convertible to an Adjutant plugin — an Adjutant-orchestrated Claude-agent worker is a clean future swap behind the same interface.

---

## 3. The 5-minute demo script

| Time | Beat | What to show | Rubric |
|---|---|---|---|
| 0:00–0:30 | **The problem** | A bland generic-AI page vs. a persona page. "Publishing in *your* voice, well-researched, is two hard jobs." | — |
| 0:30–1:15 | **The persona = the declared guardrail** | Open a seeded persona (The Essayist). Show the **Compiled-guardrail panel**: this declared persona → *this* system-prompt fragment + *these* validators. "Not a hidden prompt — declared, compiled, enforced twice." | R3 |
| 1:15–3:00 | **A run, live, in four lanes** | Start a run (concept + persona). Watch the **four pillar lanes** fill — Material in, Guardrails compiled, Checkpoints firing, Observability metering — around the **sealed agent box**. Then the money shot: **draft 1 fails voice-fidelity (`VOICE_DRIFT 0.42`) → structured feedback → draft 2 passes (0.81)**, shown as a one-click **before/after diff**. | R1, R2, R4 |
| 3:00–3:45 | **It refuses, and says why** | Show a **structured alarm card** (type · severity · context · **recommendedAction**). Show an **escalation** pause → enrich the persona → resume. "The harness knows when to stop and ask." | R5, R10 |
| 3:45–4:30 | **Same concept, two personas** | Run the *same* concept through The Essayist and The Builder → **two visibly different published pages**, side by side. "The guardrail pillar is doing real work." | ★, R3 |
| 4:30–5:00 | **Swap the worker, live (bonus)** | Re-run with a different worker — **Worker A (Vercel AI SDK) → Worker B (native Anthropic + real web_search)** — same persona, two pages, each labeled with its worker. "One line, harness untouched." Mention replay (R9) + persisted journal. | R8, **R11**, R9 |

**Safety nets:**
- If the live network is flaky, drive the whole surface from `/runs/demo` (deterministic mock, no backend) — the four lanes + the R2 diff still render live.
- The cheap, guaranteed worker swap is opus→sonnet (same SDK); the *memorable* swap is Vercel-SDK → native-web-search.

---

## 4. Pre-demo checklist
- [ ] `npm run build && npm test` green; `npm run lint` 0 warnings; `npm run test:coverage` passes.
- [ ] Seeded personas present (`npm run seed --workspace backend`).
- [ ] `/runs/demo` renders the four lanes + draft diff (the no-backend safety path).
- [ ] ngrok tunnel up; `CORS_ORIGIN` + `PUBLIC_BASE_URL` + `NEXT_PUBLIC_API_BASE` all set to the public URLs.
- [ ] `ANTHROPIC_API_KEY` set; the `anthropic-research` worker returns real sources on a test run.
- [ ] One real concept chosen (R6) and rehearsed end-to-end.
- [ ] HARNESS.md open in a tab for the architecture-defense Q&A.
