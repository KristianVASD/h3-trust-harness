# H3 Trust — OmegaClaw Harness

> **The Harness never decides.**  
> It structures investigations, preserves evidence, captures human reasoning, and accumulates validated knowledge.

This is a **Trust Investigation Platform** — not an AI agent, not a trust engine.

| Role | Meaning |
|------|---------|
| **Harness** | Investigation environment |
| **Human** | Investigator (today) |
| **OmegaClaw** | Investigator (tomorrow) |
| **CARA** | Human alignment — final validation only |

Every saved record has a **Producer** badge: `Human`, `OmegaClaw`, `ExternalAI`, or `ImportedDataset`. That way you always know *who* wrote which fact, hypothesis, or score suggestion.

---

## Quick start

```powershell
pnpm install
pnpm seed
pnpm dev
```

- Harness UI: http://localhost:5173  
- Home (welcome): http://localhost:5173/  
- Mission Control (ops): http://localhost:5173/control  
- API: http://localhost:8787  
- API health: http://localhost:8787/api/health  

`pnpm seed` loads the **DEMO** mission into `writable/` (local only — never committed).  
Maintainers can refresh the committed snapshot with `pnpm fixtures:write`.  
Reload a fixture with `pnpm fixtures:load`.

Sample bulk-import files: [`fixtures/samples/`](fixtures/samples/).

---

## BGI Open Build — 3-Minute Demo

1. `pnpm install && pnpm seed && pnpm dev`
2. Open http://localhost:5173 — read the welcome, then **Mission Control**
3. Click **Haarlemmermeer · Painters** → **Data Worker**
4. Walk the sidebar: Gaps → Probe → CURAD Align → Extract → **Profile (Harvest)** → Coverage → Search
5. On Profile: Harvest one company (or batch) → see **Can / For / Notable** fill with an Ω confidence dot
6. On Search / Results: ranked trust scores, list mentions, profile tags, human check (Agree / Adjust / Disagree)
7. Click **Export investigation** → open the JSON → full reasoning trail
8. Or open **Search** (top bar or Mission Control) → type `painters in Haarlemmermeer` → top-5 ranked answer with Why + one-click CARA

This is Trust Discovery: evidence-based, human-validated, AI-ready.

**Three entrances, one system:**

| Entrance | Path | Job |
|----------|------|-----|
| **Home** | `/` | Welcome — mission, CARA volunteers, partnership |
| **Data Worker** | `/work/:id/…` | Linear **production**: Brief → Gaps → Probe → Align → Extract → Profile → Coverage → Search |
| **Investigation** | `/missions/:id` | Deep **notebook + reviews**: Journal / Observations / Hypotheses, Align, Signals, Situation, Memory |
| **Single Search** | `/search` | One question → ranked answer from existing investigations |
| **Mission Control** | `/control` | Open / create jobs and investigations |

Switch anytime via the top bar.

---

## Design thesis

Human investigators work today. OmegaClaw becomes another investigator tomorrow. Every object carries a **Producer**. OmegaClaw never performs final CARA validation.

You investigate which **sources** and **signals** should count when judging trustworthiness of home-service companies — starting with residential maintenance (painters), later more sectors and geographies.

**OmegaClaw jobs (prompt + I/O contract):** see [`OmegaClaw.md`](OmegaClaw.md).  
Pipeline first, CARA later — CARA scores sources, confirms choices, and feeds reasons back so OmegaClaw improves; it does not block discovery.

---

## Repository layout

```
apps/harness     — Vite + React investigation UI
apps/server      — Local API (port 8787) + FileStore
packages/schema  — Shared Zod models + agent contracts
packages/store   — Store interface + FileStore (JSON on disk)
fixtures/        — Committed demos + sample imports (IN Git)
writable/        — Runtime mission data (NOT in Git)
```

| What | Location | Git? |
|------|----------|------|
| Source code | `apps/`, `packages/` | yes |
| Demo / sample data | `fixtures/` | yes |
| Live investigations | `writable/` | **no** |
| Secrets | `.env` | **no** (use `.env.example`) |

Flow:

```text
Browser (5173)  →  API (8787)  →  writable/*.json on disk
fixtures/demos  →  pnpm seed / fixtures:load  →  writable/
```

---

## Investigation pipeline

```text
Mission
  → Journal / Tasks
  → Observations          (facts only — no score)
  → Hypotheses            (ideas — keep Rejected ones)
  → Sources               (discovery list + category)
  → Companies             (candidates / targets / staged)
  → Signals               (explainable deltas)
  → Suggested confidence  (proposal, not truth)
  → CARA Review           (Sources or Companies)
  → Findings              (validated outcomes)
  → Export / Knowledge Graph / Situation Room
```

---

## How to use each screen

### 1. Home — `/`

Public welcome: why local trust, how a mission works, **become a CARA volunteer**, **partnership contact**. Demo ops live under Mission Control.

### 2. Mission Control — `/control`

Start of every investigation (ops desk).

- See existing missions (after seed: Haarlemmermeer · Painters)
- Or create a new one: location, country, sector, subsector, goal, notes
- Click **Open** to enter the workspace
- Click **Delete** to remove a mission and all its related records (confirm required)

Saves a `Mission` with phase badges (observation, hypothesis, evidence, CARA, …). Early phases are active; company deep-check is stubbed for later.

### 3. Investigation desk — `/missions/:id`

Deep notebook + reviews. **Production** (lists → companies → harvest → readiness) runs in Data Worker; this desk captures reasoning and human alignment.

**Header:** Investigation eyebrow, mission title, **Open Data Worker** (jumps to the next incomplete worker step), grouped nav:

| Group | Links |
|-------|--------|
| Notebook | Workspace |
| Reviews | Align sources · Align companies |
| Desk | Signals · Situation · Memory |

Coverage strip shows gaps / align queue / trusted / thin profiles / completeness % — each chip links into Worker or Align.

#### Workspace (notebook)

| Tab | Meaning |
|-----|---------|
| **Journal** | Notes & tasks (tasks can be marked done) |
| **Observations** | Facts only — no score |
| **Hypotheses** | Claims under test (status Draft → … → Rejected stays) |

Top of Workspace: mission overview (read-only discovery brief + source/company summaries with Worker CTAs). Edit the brief in **Data Worker · Brief**. Export investigation stays here.

#### Other desk tabs

- **Align sources / companies** — CURAD/CARA human checkpoints (same Agree / Adjust / Disagree)
- **Signals** — explainable confidence deltas
- **Situation** — where to spend time; links into Worker steps
- **Memory** (`/graph`) — browse records by kind (not a graph DB)

Legacy `/missions/:id/triage` redirects to **Data Worker · Gaps**.

### Data Worker — `/work/:id/…`

Linear production path for one mission (sidebar steps, each gated by preconditions):

| # | Step | What happens |
|---|------|----------------|
| 1 | Brief | Scope + search plan |
| 2 | Gaps | Open layer×category cells → Ask Ω `discover` |
| 3 | Probe | Unprobed candidates → richness + extraction guide (+ optional access barrier) |
| 4 | CURAD · Align | Human Agree / Adjust / Dissent on Ω proposals |
| 5 | Extract | Gated scrape (or human paste) using the guide; barriers must be fulfilled first |
| 6 | **Profile** | **Harvest** Can / For / Notable from company websites (stub Ω) |
| 7 | Coverage | Completeness score + `readyForSearch` (barrier-aware) |
| 8 | Search | Single Search scoped to this mission |

Profiles are enrichment, not a gate — a company without a harvest is still searchable; Coverage’s `profileCompleteness` just scores lower.

### Company profile (Can / For / Notable) + Harvest

Category alone is too coarse (“painter” says nothing about interior vs spray work, or private vs HOA clients). Companies therefore carry optional descriptive fields — **not** part of the trust score:

| Dimension | Field | Meaning |
|-----------|-------|---------|
| Door | `category` | Navigation label (e.g. `painting`) |
| Website | `website_url` | Harvest input (falls back to `profileSourceUrl` if set) |
| **Can** | `capabilities` | What they do (free strings, e.g. `interior painting`, `wood-rot repair`) |
| **For** | `serviceContexts` | Who they serve (`private`, `hoa`, `municipal`, `commercial`, `industrial`) |
| **Notable** | `differentiators` | What stands out (e.g. `heritage experience`) |
| Evidence | `profileSnippet` (+ URL / harvested-at / producer) | Short website summary with provenance |

Shown read-only on Companies, Worker Results, and Single Search as teal / blue / purple chips — visually separate from CARA / trust chips. Synonyms collapse via [`searchplans/capability_aliases.v1.json`](searchplans/capability_aliases.v1.json).

**Harvest (Data Worker → Profile)** fills those fields via OmegaClaw Job 4:

1. Open `/work/:missionId/profile`
2. Click **Harvest** on one company (or select several → **Harvest selected**)
3. API: `POST /api/missions/:missionId/companies/:companyId/harvest` → stub `runOcCommand("harvest")` today (no API key); Phase 9 swaps the adapter body only
4. Company is upserted with Can / For / Notable + `profileProducer: OmegaClaw`
5. UI shows a green / amber / red **confidence** dot (`high` / `medium` / `low`)

Rules that keep harvest honest:

- **No website** → still succeeds with a minimal name-only profile and `harvest_confidence: "low"` (not an error)
- **Hard failure** → writes an `Observation` tagged `harvest-failed`, leaves the company unchanged — a *signal*, never an access barrier
- **Webpage-trust probe** stays a schema placeholder (`webpageTrustProbe.notes`) — not on the critical path

Smoke: `pnpm --filter @h3-trust/server run omega:smoke` exercises with-URL (medium) and no-URL (low) harvest paths.

### 4. Single Search — `/search`

One question, one ranked answer — reads **existing** investigations only (does not create missions).

1. Type e.g. `painters in Haarlemmermeer` or `schilder voor VvE`
2. Keyword parse matches location / sector / service context to a mission
3. Companies ranked by weighted trusted-list coverage (KvK-fail excluded); optional context filter
4. Top 5 cards: score, **Can / For / Notable**, expandable **Why** (which lists), one-click backwards CARA (Correct / Adjust / Wrong)

Links out to full Investigation and Data Worker for the matched mission.

### 5. Signals — `/missions/:id/signals`

The reasoning layer.

1. Pick a source (e.g. KvK)  
2. Add a signal key: `registry`, `longevity`, `association`, …  
3. Each key has a fixed delta (e.g. longevity +8)  
4. System recomputes **suggested confidence** from base 50 + sum of deltas  
5. Explainability panel shows the math in plain text  

Still **not** a final trust score — only a proposal for CARA.

### 6. CARA Review — `/missions/:id/cara` (two checkpoints)

Human alignment. OmegaClaw must never do this as final authority.

Toggle **CARA (sources)** | **CARA (companies)** — same agree/adjust/disagree mechanism, same mark in every overview.  
**Check known sources** (Data Worker · Gaps / Coverage) is a mechanical lookup: only `accepted` / `adjusted` sources count as covered.

1. Pick an item from the queue  
2. Read suggested confidence (for companies: average of linked sources)  
3. Choose:  
   - **Agree** — one click, no reason required  
   - **Adjust** — set your score + **reason required** (≥ 8 characters)  
   - **Disagree** — reject + **reason required**  

For **sources**, Agree/Adjust/Disagree also updates source status (`accepted` / `adjusted` / `rejected`).  
For **companies**, CARA writes Review + Finding only — it does **not** change `candidate` / `target` / `staged` or `kvk_gate`.

Reuse of a source always inherits a prior human CARA judgement — it never bypasses one.

You can keep working in Workspace while reviews wait — **CARA is not a blocker.** OmegaClaw may continue Jobs 1–4; CARA later locks scores and stores Adjust/Disagree reasons as feedback (see [`OmegaClaw.md`](OmegaClaw.md)).

### 7. Situation Room — `/missions/:id/situation`

Operational cockpit:

- Progress bars (observations, hypotheses, sources, companies, CARA, journal)  
- Attention counts: needs review, company candidates, KvK fail, blacklist flags, rejected hypotheses, missing evidence, weak confidence  

Use it when you ask: “Where should I spend time next?”

### 8. Memory — `/missions/:id/graph`

Browse investigation records by kind (Mission → Hypothesis → Observation → Source → Company → Review). Click a node for producer + detail. Honest label: not Neo4j — a readable chain for one mission.

### 9. Export

From Investigation → Workspace → **Export investigation**.

Produces a full bundle (mission, observations, hypotheses, sources, signals, reviews, findings, journal, …), downloads it, and writes under `writable/export/`.

That file is what a future OmegaClaw (or another AI) should be able to **reconstruct** the same investigation from.

---

## Where data lives

After seed/use you will see folders like:

```text
writable/
  missions/
  journal/
  observations/
  hypotheses/
  sources/
  companies/
  signals/
  reviews/
  findings/
  export/
```

Each record is one JSON file. You can open them in an editor — the platform is transparent by design.

---

## Who does what

| Step | Human (now) | OmegaClaw (later) |
|------|-------------|-------------------|
| Mission | create | suggest only |
| Journal / observations / hypotheses / sources | write | write same shapes |
| Company profile (Can / For / Notable) | correct / fill | **harvest** from websites (stub live; real API later) |
| Signals / suggested confidence | assist | propose |
| **CARA / final validation** | **yes** | **never** |
| Pattern promotion | human | propose only |

Today **you are the field researcher**. The UI is already shaped so an agent can fill the same forms later without redesigning screens.

---

## 15-minute walkthrough

1. `pnpm dev` → open http://localhost:5173  
2. Open **Haarlemmermeer · Painters**  
3. **Observations** → add one new fact with a URL  
4. **Hypotheses** → add one claim; set status to Testing  
5. **Sources** → add e.g. a local association site  
6. **Signals** → attach `association` to that source; read the explanation  
7. **CARA** → Agree or Adjust with a real reason  
8. **Situation Room** → see queue counts move  
9. **Export** → save the JSON and open it to see your reasoning trail  
10. **Search** → `painters in Haarlemmermeer` → confirm the same firms surface with Why + profile tags  

If that loop feels natural, the product thesis is working: you ran a trust **investigation**, not a black-box score.

---

## Status: solid vs thin

**Solid now:** Mission Control, **Single Search**, Data Worker (8-step production spine including Profile harvest + Coverage), **Investigator desk** (notebook Journal/Obs/Hypotheses + Align + Signals + Situation + Memory), company **profile dimensions** filled by stub Ω harvest, access-barrier fulfill on extract, barrier-aware coverage / `readyForSearch`, Signals + explainability, CARA (sources **and** companies), Export, Producer on records, seed mission, local FileStore, `omega:smoke`.

**Thin / next:** live MiniMax bodies inside the Ω adapter (Phase 9 flip — contracts already frozen), real webpage-trust probe (schema slot only), capability-filter / CSI query UX, Pattern Library promote UI (schema has `PATTERN_MIN_INVESTIGATIONS = 5`), full Investigation Memory screen, richer Evidence tab, Track B fraud / company deep-check phases.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE). Part of the H3 Trust / BGI Nexus vision.
