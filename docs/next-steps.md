# H3 Trust Harness — next steps

**After the last-mile MVU (`ae82c34`).**  
Discovery was already working. The country page loads from summaries, KvK defaults cap at 30, and every inbox card has one next action. This plan is what to build *now that the door is open* — not another doctrine rewrite.

The harness never decides. You (and later OmegaClaw) propose. **CARA locks.**

---

## What is already true

Do not rebuild these.

| Fact | Why it matters |
|------|----------------|
| Good NL lists are found and often `list_ready` (Vakwerk+, OnderhoudNL, Echte Installateur, Vebidak, NLsecurity, Techniek Nederland cards). | Outcome is no longer “find lists”. It is “get companies off those lists”. |
| Country desk uses `summarizeSourcesForMission` instead of loading every source payload. | You can curate. A page that times out cannot. |
| Registry / search-form default weight is **cap 30**. CARA-locked scores stay. | KvK cannot rank above a keurmerk in new proposals. |
| GapFillBoard shows **one** next action: Extract now / Paste CSV / Probe. Identity tools sit in a collapsed tab. | The system already knew the next step; it now renders it. |
| Soul v1.0 is prepended on OpenRouter and clipboard Job prompts. | Future harvests inherit the vibe. It is not the path to companies this week. |
| HVAC already has companies. | Skip that door. |

**Definition of done for this week (still operational):** ≥ 8 of 12 doors have `companies > 0` via the CSV bridge. HVAC already counts.

---

## How to read this plan

Each step has **why**, **what**, and **done when**. Order is “companies per hour of work”, then “correctness that compounds”, then “scale”. Do not start a later phase while an earlier one still blocks HandyHouseHelp from seeing NL firms.

```text
A  Fill empty doors (CSV / headless)
B  Tighten the last metre of the inbox
C  Enforce soul bands as schema (not more prose)
D  Single-search: national once, local every search
E  Culture / nation worksheets
F  OmegaClaw held manifest
```

Queue platforms, Vercel KV, and a scraper farm stay **out**. Headless dump + existing Attach-CSV is the extract path until a door is full.

---

## Phase A — Fill the empty doors

**Why this is first.**  
HandyHouseHelp cannot match a household to a painter if the paint pack has lists and zero companies. Probed `accessBarrier: blocks-extract` rows already prescribe the fix (“paste a CSV export”). The inbox button now points at that flow. Walking the shortlist is the highest-leverage work left this week. Code will not invent the cookie-walled ledenlijst for you.

**What**

One headless dump per shortlisted source (cookie walls included — `extractionGuide` already says so), then paste through **Attach list** or Extract → Paste CSV. Match keys already exist. Skip HVAC.

| Door | Best extractable source(s) | Why this source |
|------|----------------------------|-----------------|
| paint | OnderhoudNL zoek-een-bedrijf · Vakwerk+ /bedrijven/ | Human-scored / `list_ready`; barrier is completeness, not identity chrome. |
| roof | Vebidak /onze-leden · Dakmerk · Hét Dakproef | Niche trade lists with a real member surface. |
| bath | Techniek Nederland badkamer/sanitair · VLOK | Probed cards; do not re-discover KvK SBI. |
| solar | Techniek Nederland zonne-energie · InstallQ | Same: national curated layer, already probed. |
| electro | Echte Installateur finder · TN elektro | Accepted list; postcode iteration is a dump, not a new harvest. |
| hvac | — | Already filled. Skip. |
| security | NLsecurity · NVD erkende bedrijven | `list_ready`; barrier is extract, not find. |
| drain | Echte Installateur Riool · rioolbeheersing | Filter an existing accepted list. |
| pest | Platform Plaagdierbeheersing · KAD/SPA-bv | Barrier says human paste — obey it. |
| glazing | OnderhoudNL · VMR | OnderhoudNL already covers glass; do not invent a registry. |
| handyman | VLOK vind-een-klusservice | One finder, one dump. |
| garden | Stagemarkt leerbedrijven (one wizard run) | Training list = real craft investment; one headless pass. |

**Done when:** at least **8 doors** show `companies > 0` on Mission Control. Prefer fewer strong lists over another discover run.

---

## Phase B — Tighten the last metre

**Why this is next.**  
Phase A will hurt in the same three places every door: “which pack do I paste into?”, “did extract actually run?”, “did I just re-import KvK?”. Small harness fixes here multiply across 11 remaining dumps. Do not build a scraper platform.

**What**

1. **Prefill Attach-CSV from the inbox source** (name, URL, category, `listLabel`) so Paste CSV does not open a blank form. *Why:* every extra field is a chance to attach the dump to the wrong list and break match keys.
2. **Show extract outcome on the door card** (`0 companies — last action: Paste CSV on Vakwerk+` or `extracted 412`). *Why:* the original pain was “where do I click and what is next?”. After A, the question becomes “did this door move?”
3. **Refuse extract on identity tools** in the UI (button hidden is not enough if someone hits the API). *Why:* the weight cap stops ranking; a hard skip stops another 5 000-row chrome import from looking like progress.
4. **Warm-start must not re-link a wall of KvK SBI variants.** *Why:* we hid them; linking them again on a new pack recreates the burial.

**Done when:** a curator can go Gaps → one click → paste → see the door company count rise, without hunting mission IDs or identity rows.

---

## Phase C — Enforce the soul as schema

**Why not sooner.**  
Small prompts underperformed because they had tasks and no doctrine. Soul v1.0 is now first context. That improves *future* harvests. It does **not** fill empty doors. Enforce bands only after Phase A so we lock calibration against real lists (Vakwerk+ vs KvK), not against an empty pack.

**Why it matters at all.**  
Prose is cheap to ignore. `defaultWeightForList` was a one-line bug that made KvK look like 95. The next bug will be a model free-styling 88 on a pay-to-play directory. §3 bands and the §9 card exist so OmegaClaw (and import) can **reject** a proposal, not merely be asked to behave.

**What**

- Machine-readable §3 bands: identity `0–30`, legal/skill `40–60`, curated national `70–90`, local-by-depth `40–90`. `suggestedWeight` outside the band fails import (CARA-locked rows exempt).
- Mandatory §9-shaped card on discover: barrier, weirdness sentence, pay-to-play, participation depth, match keys, `list_ready` or `accessBarrier`. No card, no candidate.
- Bump soul version when CARA locks a band change so cached copies invalidate.

**Done when:** a KvK search URL cannot enter as a trust list with weight > 30, and a keurmerk without a barrier sentence cannot enter as `found: true`.

---

## Phase D — Single-search (national once, local every time)

**Why this is the product shape.**  
National discovery is expensive and almost the same for every Haarlem / Alkmaar / Tilburg painter search. Local proof is what changes: ondernemersvereniging, sponsor board, festivity, gemeente, reviews. The BEFORE/AFTER picture is the architecture: skip broad search when the **National Sector Layer** exists; run only local verification; same trust score, fraction of the cost.

Nation harvest and `needs_overlay` already express this. What is missing is the *default* for a user search and a place test: **do not re-open national gaps**.

**What**

- Persist a layer version on each national pack (soul version + harvest time + CARA lock). Stale = version mismatch or explicit refresh.
- Place / Single Search runs: if the country×door layer is ready, skip national rediscovery. Work local channels only (cooperation / empowerment network / sport / festivity / municipal / media) plus identity verify-only.
- Search result provenance: national layer reused (yes/no, version) · local checks run · weirdness / absence flags · score contribution.

**Why provenance matters.**  
Without it, a 85/100 looks like a model vibe. With it, CARA can disagree with *which layer* was weak, and the next search stays small.

**Done when:** Alkmaar × paint with a ready NL paint pack does not propose 28 KvK URLs, and the result card says the national layer was reused.

---

## Phase E — Culture and nation worksheets

**Why not export Dutch shapes.**  
Channel 8 is not “a business club”. It is a **local business cooperation / empowerment network** — an OV in NL, an active Facebook group, an India RWA / WhatsApp community. The doctrine (§2–§3) is culture-invariant. Instantiation is not. Filling Worksheet A *before* harvest in a new country is cheaper than cleaning 28 wrong-shaped lists afterwards.

**What**

- Worksheet A on `NationLandscape`: identity registry, legal thresholds, curated networks with probed barriers, ≥5 local proof structures, online reputation platforms, native operators, CARA sign-off.
- Interview local humans. Never assume KvK / OV / braderie exist under those names.
- Weight calibration uses the Weirdness Test *in that culture* (a signal strong in NL may be buyable elsewhere).

**Done when:** a new country cannot leave `status: ready` with empty local-proof structures, and harvest prompts receive the filled worksheet, not a Dutch checklist.

---

## Phase F — OmegaClaw held manifest

**Why last among these.**  
OC as cache-mem only pays off when §3/§9 are schema (Phase C) and the national layer is a real cached asset (Phase D). Until then, “held manifest” is a second copy of a markdown file.

**What**

- Soul v1.x is the held document; version bump invalidates cache.
- OC validates cards and bands as schema, not as a longer system prompt.
- Human lock remains CARA. OC proposes and extracts; it does not lock weights.

**Done when:** a live OC job fails closed on a missing card or out-of-band weight, and the curator sees the same §9 fields the model was asked to fill.

---

## Explicitly later

These are real, but they do not create companies or prevent the next KvK flood.

| Item | Why wait |
|------|----------|
| Trigger / Inngest / scrape queues | Extract is still “one headless dump + CSV”. A queue without a stable list surface is a timeout in the background. |
| Vercel KV / ISR for the country page | Summaries already address the timeout. Cache after the desk is boring. |
| Full trust-score productisation for Utsa / digital twin | Needs companies on the door (A) and local overlay (D). |
| Rewriting H3TrustSoul.md | Voice is fine. Version it when bands change. |

---

## Suggested cadence

| When | Do | Why |
|------|----|-----|
| This week | Phase A (and B only if a dump is blocked by a blank form) | Companies for HHH. |
| After ≥8 doors have firms | Phase B leftovers, then C | Lock the ranking rules against real lists. |
| When a second place search is painful | Phase D | That is the first time national-once saves real time. |
| First non-NL country | Phase E, then a thin harvest | Worksheet before discover. |
| When OC actually sits on the server | Phase F | Schema is the contract; OC consumes it. |

---

## One-sentence compass

Presence is cheap. Proof is local. The national layer is built **once**. Every search after that should only ask: *would it be weird for a scammer to sustain this here?* Then extract the list you already found.
