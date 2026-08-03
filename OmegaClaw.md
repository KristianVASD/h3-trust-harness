# OmegaClaw — Interaction Contract

> **OmegaClaw investigates. The harness stores. CARA confirms later.**  
> CARA does not block the pipeline. It scores, approves, and feeds learning back to OmegaClaw.

This is the contract for live OmegaClaw jobs against the H3 Trust Harness.  
Companion docs: [`README.md`](README.md) (product), [`Start.md`](Start.md) (vision), [`packages/schema`](packages/schema) (Zod + agent stubs).

---

## Roles

| Role | Does | Does not |
|------|------|----------|
| **Harness** | Orchestrates jobs, validates JSON, writes records, computes suggested confidence | Decide trust |
| **OmegaClaw** | Discovers sources, evidence, companies, profiles; proposes scores | Final Agree / Adjust / Disagree |
| **Human** | Keeps / edits / runs CARA when ready | Required between every OmegaClaw step |
| **CARA** | Later validation: score sources, confirm or correct OmegaClaw, capture reasons | Gate Jobs 1–4 |

Every record carries `producer: "OmegaClaw" | "Human" | …`.

---

## Core principles

1. **Pipeline first, CARA later.** Jobs 1 → 2 → 3 → 4 may run end-to-end on OmegaClaw output. CARA can run anytime after candidates exist — in parallel or after the fact.
2. **CARA is feedback, not a brake.** Agree / Adjust / Disagree locks human judgement, scores sources, and stores reasons OmegaClaw (and Pattern Library) learn from.
3. **Gaps are `layer` × `category`.** Never a flat category list. Nuance rules come from [`searchplans/default.v1.json`](searchplans/default.v1.json).
4. **Candidates only from OmegaClaw.** Status stays `candidate` (or moves to `draft` / `pending_review` for human convenience). Only CARA sets `accepted` / `adjusted` / `rejected` on sources.
5. **No invented URLs.** If nothing real exists for a gap, return `found: false`.
6. **Suggested scores are proposals.** `suggestedWeight` / `suggestedConfidence` ≤ 90 for soft sources; hard identity registries may go ≤ 95. Humans lock the final score via CARA.
7. **One job = one LLM call.** The harness assembles context, validates output, stores results.

### What CARA is for

| Use | Why |
|-----|-----|
| Approve / reject sources | Lock which lists count as trusted coverage |
| Confirm or correct OmegaClaw choices | Adjust weight / confidence with a required reason |
| Score sources | Human score becomes the durable signal for ranking & reuse |
| Teach OmegaClaw | Adjust / Disagree reasons → learning ledger → future prompts & patterns |
| Backwards check from Single Search | Correct / Adjust / Wrong on a ranked answer |

Operational UI thresholds (e.g. “≥5 accepted/adjusted lists” before some Import deep-check) are **harness policy for humans**, not a stop for OmegaClaw jobs.

---

## The five jobs

| Job | Kind (API stub) | Input focus | Output → store as |
|-----|-----------------|-------------|-------------------|
| **1 Source Discovery** | `discover_sources` | Open gaps (`layer` × `category`) | Candidate `Source`s (+ optional observations) |
| **2 Source Evidence** | `collect_evidence` | One (or small batch of) candidate source(s) | `evidence`, suggested scores, optional signals / observations |
| **3 Company Discovery** | `discover_companies` *(extend enum)* | Working sources for this mission | Candidate `Company`s |
| **4 Profile Harvest** | `harvest_profile` *(extend enum)* | One company + website | Can / For / Notable (descriptive — not trust) |
| **5 Refresh / Delta** | `refresh_check` *(extend enum)* | Existing mission or one company | Deltas only → queue for human / CARA if needed |

Extend `AgentJobStub.kind` in [`packages/schema/src/agent-contracts.ts`](packages/schema/src/agent-contracts.ts) for jobs 3–5.

---

## Scenarios (what the harness sends)

| Scenario | Situation | Call |
|----------|-----------|------|
| **A Cold start** | New location + new sector | Job 1 (all open gaps) → 2 → 3 → 4 |
| **B New sector** | Location known; national (+ local reuse) sources exist | Job 1 only **sector-specific** gaps → 2 → 3 → 4 |
| **C New location** | Sector known; national sources exist | Job 1 only **regional/local** gaps → 2 → 3 → 4 |
| **D Full refresh** | Mission already populated | Job 5 (`full_mission`) |
| **E Single company** | One firm to re-check | Job 5 (`single_company`) |

Always pass `existing_sources` / `existing_companies` so OmegaClaw does not duplicate. Prefer **linking** national accepted sources into a new mission over rediscovering them.

---

## Flow (non-blocking)

```text
Harness picks scenario + open gaps
        │
        ▼
  Job 1  discover sources  ──► candidate Sources
        │
        ▼
  Job 2  evidence & opinion ──► evidence + suggested scores
        │                         (optionally status → draft / pending_review)
        ▼
  Job 3  discover companies ──► candidate Companies  (uses working sources now)
        │
        ▼
  Job 4  harvest profiles   ──► capabilities / serviceContexts / differentiators
        │
        ▼
  Harness ranking / Single Search can already use proposals
        │
        ▼
  🧑 CARA (async, whenever) ──► accept / adjust / reject + reasons
        │                         scores locked · feedback for OmegaClaw
        ▼
  Findings · Pattern Library · next OmegaClaw run gets better
```

Job 5 later: deltas only; if material change → surface in Situation Room / CARA queue.

---

## Job 1 — Source Discovery

### When

New mission, new sector, or new location — whenever open gaps remain.

### Prefer per-gap (or small batch)

Match the Gap Fill board: one call per open gap, or a short batch of open gaps.  
Full-plan dumps are optional for cold start only.

### Input (shape)

```json
{
  "job": "discover_sources",
  "missionId": "<uuid>",
  "context": {
    "country": "Netherlands",
    "location": "Haarlemmermeer",
    "sector": "Home Maintenance",
    "subsector": "Painters",
    "goal": "Find trustworthy painting companies for residential service in Haarlemmermeer"
  },
  "open_gaps": [
    {
      "layer": "national",
      "category": "branch_association",
      "nuance_rule": "National trade association: useful for discovery and soft trust. Check that it publishes real member lists, not marketing only."
    },
    {
      "layer": "local",
      "category": "local_business_association",
      "nuance_rule": "Local business association: strong locality source when the member list is public and multi-year."
    }
  ],
  "existing_sources": [
    {
      "id": "<uuid>",
      "name": "KvK (Kamer van Koophandel)",
      "category": "registry",
      "scope": "national",
      "status": "accepted"
    }
  ],
  "reuse_note": "Optional — e.g. Scenario B/C: only fill gaps listed; national already covered."
}
```

### System prompt (Job 1)

```text
You are OmegaClaw discovering trust lists for H3 Trust Harness.

Fill ONLY the open_gaps (each is layer × category + nuance_rule).
Return real, currently active sources with public (or clearly listable) company members.
Do not invent URLs or names. If none exists for a gap, return found=false for that gap.
Do not duplicate existing_sources.
scope must equal the gap layer. regional/local → region = mission location; national → region = "".
status will be set to candidate by the harness. Do not claim acceptance.
suggestedWeight is a proposal (soft sources ≤ 90; hard identity registry ≤ 95).

DISCOVERY PATTERN — PLATFORM CASCADE:
When a gap has no direct list source, search for PLATFORMS that power such lists
(sponsor management tools, business club software, directory engines). If found,
enumerate their clients in the target region and treat each client's public page
as a candidate source. Report the platform as discoveredVia on each source.

LIST RENDER TYPE:
For each source, set listRenderType: "text" | "images" | "js-app" | "pdf".
If "images" or "js-app", do NOT mark found=false only because a text agent cannot
read the list — mark found=true, set listRenderType, and raise accessBarrier
noting that a vision / browser step is needed for extract.

OUTPUT: strict JSON only (see contract). No markdown.
```

Manual / offline agents may also return the Qwen-compatible `{ "gaps": [ { layer, category, found, sources[], motivation_not_found? } ] }` envelope. Paste it on Data Worker → Gaps → **Import as Ω** (`POST /api/missions/:id/omega/import` with `job: "discover"`).

### Output (envelope → map into `Source`)

```json
{
  "producer": "OmegaClaw",
  "missionId": "<uuid>",
  "discovered_sources": [
    {
      "found": true,
      "name": "Nederlandse Schilders Bond",
      "type": "association",
      "category": "branch_association",
      "scope": "national",
      "region": "",
      "url": "https://www.schildersbond.nl",
      "reason": "National painters association with a searchable member list.",
      "suggestedWeight": 75,
      "suggestedConfidence": 70,
      "nuance_applied": "Confirmed public member list, not marketing-only.",
      "confidence_in_existence": "high"
    },
    {
      "found": false,
      "category": "sponsorship",
      "scope": "local",
      "region": "Haarlemmermeer",
      "reason": "No aggregated sponsorship registry for painters here.",
      "suggestedWeight": null,
      "confidence_in_existence": "n/a"
    }
  ],
  "observations": []
}
```

**Harness:** each `found: true` → `Source` with `status: "candidate"`, `producer: "OmegaClaw"`. Store observations separately. **Do not wait for CARA.**

Envelope-only fields (`found`, `nuance_applied`, `confidence_in_existence`) stay on the agent response schema — not on `SourceSchema`.

---

## Job 2 — Source Evidence & Opinion

### When

After Job 1 (or when a human asks OmegaClaw to investigate a candidate). One source per call by default; batch 3–5 only if needed.

### Input (shape)

```json
{
  "job": "collect_evidence",
  "missionId": "<uuid>",
  "source": {
    "id": "<uuid>",
    "name": "Ondernemersvereniging Haarlemmermeer",
    "type": "association",
    "category": "local_business_association",
    "scope": "local",
    "region": "Haarlemmermeer",
    "url": "https://www.ovhaarlemmermeer.nl",
    "status": "candidate"
  },
  "nuance_rule": "Local business association: strong when member list is public and multi-year.",
  "context": {
    "country": "Netherlands",
    "location": "Haarlemmermeer",
    "sector": "Home Maintenance",
    "subsector": "Painters"
  }
}
```

### System prompt (Job 2)

```text
You are OmegaClaw investigating ONE source for H3 Trust Harness.

Determine: live URL? domain/org age? public member list? membership barrier
(low|medium|high|unknown)? content quality? real-world presence (events, news, LinkedIn, Facebook)?
Apply the nuance_rule. Propose suggestedConfidence and suggestedWeight (honest; do not inflate).
summary_reasons must use ✓ / ✗ / ? prefixes.

This is a SUGGESTION for later CARA — not a final score.

ACCESS BARRIERS: if the list requires a human action to access (apply for a key,
  email the org, member login, captcha, paywall, a PDF behind a form, a rate limit),
  you MUST fill `accessBarrier` with kind/severity/what_omega_needs/what_human_does
  and set severity to "blocks-extract" when you cannot get the companies yourself.
  Do NOT pretend to have extracted companies you could not actually see.
NEVER attempt to bypass authentication, captchas, robots.txt, paywalls, or rate
  limits. Producing a "fuller" list by breaking these rules is a FAILURE, not a
  success. Raise a barrier instead. A human will resolve it.
If a free single-lookup exists but bulk access does not (e.g. KvK), say so:
  free_tier_available=true, kind="manual-lookup", and explain the per-item model.

OUTPUT: strict JSON only. No markdown.
```

### Output (maps to `Source.evidence` + scores)

```json
{
  "producer": "OmegaClaw",
  "missionId": "<uuid>",
  "sourceId": "<uuid>",
  "evidence": {
    "checked_at": "2026-07-24T10:30:00.000Z",
    "url": "https://www.ovhaarlemmermeer.nl",
    "domain_age": "12 years",
    "org_age": "since 1998",
    "host_info": "TransIP, Netherlands-hosted",
    "membership_threshold": "medium",
    "content_consistency": { "ok": true, "note": "Current member directory and events." },
    "real_world_presence": {
      "events": true,
      "news": true,
      "linkedin": true,
      "facebook": true,
      "notes": "Regular networking in Hoofddorp."
    },
    "summary_reasons": [
      "✓ Multi-year organisation with public member list",
      "✓ Real events and regional news mentions",
      "? Medium barrier — fee + KvK, no peer vetting"
    ]
  },
  "suggestedConfidence": 72,
  "suggestedWeight": 65,
  "opinion": "Solid local supporting source; not a primary sector association.",
  "signals_proposed": [],
  "observations": []
}
```

**Harness:** write `evidence`, scores; optional Signal / Observation rows. May move status `candidate` → `draft` or `pending_review` for human convenience. **Pipeline continues without CARA.** CARA later Agree/Adjust/Disagree locks score and status.

---

## Job 3 — Company Discovery

### When

After there are **working sources** for the mission (candidates with evidence, drafts, or already CARA-accepted). Prefer stronger / already-scored sources when available — do not require a full CARA pass.

### Input (shape)

```json
{
  "job": "discover_companies",
  "missionId": "<uuid>",
  "context": {
    "country": "Netherlands",
    "location": "Haarlemmermeer",
    "sector": "Home Maintenance",
    "subsector": "Painters"
  },
  "working_sources": [
    {
      "id": "<uuid>",
      "name": "KvK",
      "category": "registry",
      "scope": "national",
      "url": "https://www.kvk.nl",
      "status": "accepted",
      "suggestedWeight": 95
    },
    {
      "id": "<uuid>",
      "name": "Ondernemersvereniging Haarlemmermeer",
      "category": "local_business_association",
      "scope": "local",
      "url": "https://www.ovhaarlemmermeer.nl/leden",
      "status": "draft",
      "suggestedWeight": 65
    }
  ],
  "existing_companies": [
    { "id": "<uuid>", "name": "Vakschilder Jansen", "kvk_number": "23456789" }
  ]
}
```

### System prompt (Job 3)

```text
You are OmegaClaw extracting companies from the given working source lists only.
Do not invent companies or add firms from general knowledge.
Record source_ids + list_membership for every hit.
kvk_gate = "pass" only if an 8-digit KvK is visible; else "unchecked" (never invent "fail").
Skip existing_companies (match name or kvk_number).
status = "candidate". region = mission location. category = navigation door (e.g. painting).

Extract ONLY from the sources the harness passes you. If a passed source still
  needs auth you were not given, return it in a `blocked` note — never bypass.
`fieldsExtracted` for each company MUST be a subset of that source's guide fields.

OUTPUT: strict JSON only. No markdown.
```

### Output

```json
{
  "producer": "OmegaClaw",
  "missionId": "<uuid>",
  "companies": [
    {
      "name": "Schilderbedrijf De Vries",
      "address": "Kruisweg 45, 2131 CR Hoofddorp",
      "region": "Haarlemmermeer",
      "sector": "Painters",
      "category": "painting",
      "kvk_number": "34567890",
      "kvk_gate": "pass",
      "source_ids": ["<uuid>", "<uuid>"],
      "list_membership": ["KvK", "Ondernemersvereniging Haarlemmermeer"],
      "blacklist_flags": [],
      "status": "candidate"
    }
  ],
  "discovery_notes": "…",
  "observations": []
}
```

---

## Job 4 — Company Profile Harvest

### When

Company has (or should have) a website; `capabilities` / `serviceContexts` / `differentiators` empty or stale.  
**Descriptive only — not trust.** No CARA required.

### Input

Pass company stub + [`searchplans/capability_aliases.v1.json`](searchplans/capability_aliases.v1.json) + allowed `serviceContexts`: `private` | `hoa` | `municipal` | `commercial` | `industrial`.

### System prompt (Job 4)

```text
You are OmegaClaw harvesting a company website for H3 Trust Harness.
THIS IS NOT A TRUST JUDGEMENT.
Map site language to canonical English capability names via capability_aliases.
serviceContexts: only from the allowed enum.
differentiators: short free strings for what stands out.
profileSnippet: 1–2 factual sentences: "[Name] [does what] for [whom] in [where]."
Only include what the site states or clearly shows.

OUTPUT: strict JSON only. No markdown.
```

### Output

```json
{
  "producer": "OmegaClaw",
  "missionId": "<uuid>",
  "companyId": "<uuid>",
  "profile": {
    "capabilities": ["interior painting", "exterior painting", "wood-rot repair"],
    "serviceContexts": ["private", "hoa"],
    "differentiators": ["family business since 1987", "colour advice included"],
    "profileSnippet": "Schilderbedrijf De Vries is a family-run painting company in Hoofddorp serving private homeowners and HOAs since 1987.",
    "profileSourceUrl": "https://www.schilderbedrijfdevries.nl",
    "profileHarvestedAt": "2026-07-24T11:00:00.000Z",
    "profileProducer": "OmegaClaw"
  },
  "harvest_confidence": "high",
  "harvest_notes": "…"
}
```

---

## Job 5 — Refresh / Delta Check

### When

Scenario D (full mission) or E (single company). Report **changes only**.

### Rules

- Empty delta + explicit “unchanged” if nothing moved  
- New companies → `status: "candidate"`  
- Removals → suggested `blacklist_flags` / notes — human decides  
- Source content changes → new `evidence` snapshot; surface for CARA if trust impact  

### Output sketch

```json
{
  "producer": "OmegaClaw",
  "missionId": "<uuid>",
  "checked_at": "2026-07-24T14:00:00.000Z",
  "delta_summary": {
    "sources_changed": 1,
    "companies_added": 1,
    "companies_removed": 0,
    "companies_changed": 0,
    "overall_status": "minor_changes"
  },
  "source_deltas": [],
  "company_deltas": [],
  "removal_flags": [],
  "observations": []
}
```

---

## Scenario filters (Job 1)

**B — New sector, known location:** pass national + reusable local sources in `existing_sources`; `open_gaps` = sector-specific only (`sector_qualification`, `quality_mark`, `branch_association`, …).

**C — New location, known sector:** pass national sources; `open_gaps` = regional/local only; set `region` to the new location.

---

## Status & scoring (sources)

| Status | Who sets it | Meaning |
|--------|-------------|---------|
| `candidate` | OmegaClaw / human propose | Newly found |
| `draft` | Human keep or harness after Job 2 | Working list; evidence in progress |
| `pending_review` | Human / harness | Ready for CARA queue |
| `accepted` / `adjusted` / `rejected` | **CARA only** | Locked human judgement |

Suggested scores (OmegaClaw) → CARA Agree (keep) / Adjust (new score + reason) / Disagree (reject + reason).  
Company CARA writes Review + Finding; it does **not** change `candidate` / `target` / `staged` or `kvk_gate`.

National `accepted`/`adjusted` sources warm-start other regions. Regional/local only match when `region` matches.

---

## Implementation notes

1. **Orchestration lives in the harness** — assemble input, call LLM, parse JSON, Zod-validate envelopes, map into entities, stamp `id` / `createdAt` / `updatedAt` / `v` / `producer`.
2. **Two schema layers:** agent response envelopes (this doc) → existing `SourceSchema`, `CompanySchema`, `ObservationSchema`, etc.
3. **Ingress:** same APIs humans use (`POST /api/missions/:missionId/sources`, companies, observations, …), plus **manual Ω JSON** via `POST /api/missions/:missionId/omega/import` `{ job, payload }` for offline Qwen / pasted envelopes. See `AGENT_API` in agent-contracts. Agents must not call final CARA authority endpoints.
4. **Idempotency:** pass existing entities; prefer `sources/link` for reuse.
5. **Failures:** invalid JSON / schema → `AgentJobStub` `status: "failed"`; human retries or fills manually. Gap Fill “Ask OmegaClaw” stub today writes fake candidates — replace with Job 1 (+ optional Job 2).
6. **Single Search** consumes investigated + (preferably CARA-scored) data; backwards CARA on results is part of the feedback loop.

---

## Relation to the UI today

| Entrance | OmegaClaw role |
|----------|----------------|
| Data Worker → Gaps (Gap Fill + Import Ω JSON) | Jobs 1–2 (+ offline paste) |
| Data Worker → Probe / Extract | Jobs 2–3; paste Job JSON or stub Ask Ω |
| Data Worker → Import / Profile | Jobs 3–4 after working sources exist |
| Investigation desk | Same jobs; richer journal / Situation Room |
| Single Search | Reads outcomes; optional Job 5 / backwards CARA |

Human investigators already write the same shapes. OmegaClaw fills them. CARA scores and teaches.

---

## Status of this contract

| Ready in repo | Still to build |
|---------------|----------------|
| Source / company / evidence Zod models | Live LLM wiring for Jobs 1–5 |
| Gap plan + Gap Fill stub | Per-gap Job 1 behind “Ask OmegaClaw” (live) |
| `omega/import` for offline Job 1–4 JSON | Feed Adjust/Disagree reasons into learning / next prompts |
| `discover` / `probe` / `extract` / `harvest` stubs | Vision sub-agent for `listRenderType: images` |
| CARA UI (sources + companies) | |
| Single Search ranking | Prefer CARA-locked weights when present |

When in doubt: **let OmegaClaw run; let CARA catch up; never let CARA stall discovery.**
