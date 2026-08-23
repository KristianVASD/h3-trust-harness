# H3 Trust Harness — operator manual

How to work H3 today: **you** find lists, scrape or polish CSVs, copy prompts into Qwen / Cursor, paste JSON back. OmegaClaw will replace the copy-paste later. **CARA never changes.** The harness stores evidence and suggestions. A human locks what counts.

> **The Harness never decides.** Import writes facts. Ω (or you-as-Ω) proposes. CARA is the only alignment act.

You must be signed in as an **approved CURAD volunteer** to write (import, CARA, promote). Until admin approval, you can look but not save.

---

## Where you work

| Screen | URL | Use it for |
|--------|-----|------------|
| **Mission Control** | `/control` | Onboard a list onto a **national pack** (country × trade). Attach local / mixed lists. Download HHH leads. |
| **Data Worker** | `/work/:id/…` | The 9 production steps for one pack. |
| **Single Search** | `/search` | End-user question → ranked companies from packs already imported. |
| **Investigation** | `/missions/:id` | Notebook + extra CARA queues (sources **and** companies). Optional depth, not the daily spine. |

Open a pack from Mission Control → **National · N** (or a location job) → Data Worker starts at **Brief**.

---

## 12 trade doors (HHH specialties)

Mission Control coverage, Single Search, and HHH lead export all use the same 12 doors: `paint`, `electro`, `hvac`, `bath`, `drain`, `roof`, `glazing`, `garden`, `security`, `solar`, `pest`, `handyman`.

| Is a door | Is not a door |
|-----------|----------------|
| The 12 HHH specialties above | **VvE** — For tag (`hoa`), same trade, different client |
| | **Gevel / buitenschil** — Can under paint, glazing, or roof |
| | Masterlist category G (VvE common spaces) — SEIN, not the coverage list |
| | Kozijnen / carpentry as a 13th pack |

Vocabulary lives in `searchplans/trades.v1.json` (ids, aliases, pack aliases, specialisations). Can synonyms live in `searchplans/capability_aliases.v1.json` and point at those doors via `parentTrade` — do not add a 13th overview.

**Installers:** one live list may still serve `electro` + `hvac` + `bath`. Overviews still show three rows; empty ones stay empty until a niche list lands. Onboarding `paint` attaches to the existing **Painters** pack.

**Search:** a specialisation (`wespen`) opens the parent door (`pest`) and **boosts** matching Can tags. Rows with empty Can stay visible. `vve` / `particulier` only set For.

---

## Two ways of working

### A. Fast path (what you do most days)

You already have a member list (CSV). You do **not** need Gaps → Probe first.

1. Polish the CSV (see [CSV format](#csv-format)).
2. **Mission Control → Attach local list to national pack.**
3. Fill country / sector / **trade** (one of the 12 ids) / source name / URL / layer / category / weight / audience.
4. Tick **Mixed list** for OV, sportclub, networking (or pick a mixed category — the box ticks itself).
5. Paste or upload CSV → **Onboard**.
6. Open the national pack in Data Worker → **Align** and CARA the source weight.
7. **Search** to check the pack. Mixed leftovers → **Classify**.

### B. Discovery path (when you do not have a list yet)

Walk the Data Worker rail: Brief → Gaps → Probe → Align → Extract → Classify → Profile → Coverage → Search.

Same CARA rules. Same CSV / JSON feeds. Align does **not** block Extract; it locks **ranking weights**.

---

## Golden map: what you feed vs what you CARA

| Step | You feed | CARA? | When |
|------|----------|-------|------|
| Mission Control onboard | CSV + source metadata (+ optional weigh prompt) | **Later** on Align | After the list exists |
| 1 Brief | Nothing — confirm scope | No | Always first on a new job |
| 2 Gaps | URLs, or Job 1 JSON | No — only **Keep** / **Ready for CARA** | When you need more lists |
| 3 Probe | Job 2 JSON, or stub Probe | No — barriers are human **fulfil**, not CARA | After candidates exist |
| 4 Align | Nothing — you judge | **Yes — source Agree / Adjust / Dissent** | After Keep, Ready for CARA, or probed candidates |
| 5 Extract | CSV **or** Job 3 JSON | Optional skip: **Accept as imported list** | When you have members |
| 6 Classify | Job 6 JSON (verdicts) | **Yes — Agree · promote** | After mixed-list unknowns exist |
| 7 Profile | Optional harvest stub | No | Optional depth |
| 8 Coverage | Nothing | No — read-only score | After companies exist |
| 9 Search / Single Search | A query | **Optional — company Agree / Adjust / Disagree** | After results show |

---

## Mission Control — attach a list

**Path:** top bar → Mission Control.

One **national pack** per country × trade door (example: Netherlands · `paint` / Schilders). Location is the **source region** (Hoofddorp), not a new town mission. Search later filters that pack by place / postcode cluster.

### Fill in

| Field | What to put |
|-------|-------------|
| Country / Sector / Trade | Pack identity. Trade is one of the 12 ids (`paint`, not “Hoofddorp” and not VvE). |
| Location | Optional. Region of *this list* (town, gemeente). Attaches to the national pack. |
| Source name + URL | The list’s identity (Vakwerk+, OVHZ, SV Hoofddorp Business Club). |
| Layer | `national` / `regional` / `local`. |
| Category | What kind of list. Mixed categories auto-tick Mixed. |
| Trust weight 0–100 | Proposal only until Align. Vakwerk+ ≈ 90, football sponsor ≈ 40, OV ≈ 65. |
| Default audience | List default, not per company: B2C / B2B / VvE / municipal / unknown. |
| Mixed list | On for OV / sportclub / networking. Matches **all** sector packs in the country; unmatched rows stay **unknown** in **Netherlands · Local Directory**. |
| List membership label | Short badge on the company (e.g. `Vakwerk+`). |
| CSV | Member rows. |

**Copy source classification prompt** (details on the form) into Qwen / Cursor **before** import if you are unsure mixed / weight / audience / match keys. Then set those fields yourself. That prompt is **not** CARA.

**Onboard.** Keep the tab open on large files (batches of 20). Re-run is safe: same names merge, they are not duplicated.

After import you should see something like:

- Niche: `+N companies (M merged)`
- Mixed: `matched` onto packs + `unknown in local directory`
- Optional: `N rows in Hoofddorp cluster`

Then open the **National** job → Align (source CARA) → Search.

**Download HHH high-trust leads** exports companies on **≥2 independent lists**. Each row has `specialty` (door id: `paint`, `pest`, …), `tags` (Can), and `audience` (For: `private` / `hoa` / …). Filter `?subsector=paint` or `Painters`. Pest rows appear only after a pest pack has ≥2-list companies. HandyHouseHelp still adds the specialty in that app.

---

## CSV format

Paste or `.csv` / `.txt`. Header row recommended.

| Canonical | Also accepted |
|-----------|----------------|
| `name` | `title`, `company`, `company_name` |
| `address` | `address_line`, `street` |
| `postal_code` | `postcode`, `zip` |
| `region` | `city`, `locality`, `place` |
| `website_url` | `website`, `url`, `site` |
| `kvk_number` | `kvk`, `kvk_nr` (8 digits when you have it) |
| `specialism` | `services`, `service` → become **Can** chips |
| `phone` | `tel`, `telephone` |
| `email` | `mailto`, `mail` |

Dedup waterfall: **KvK → email/website domain → normalized name + 4-digit postcode** (BV/VOF stripped). Same firm on two lists gets **both** `source_ids`.

Do not invent KvK, websites, or firms. Empty cells are fine.

---

## Data Worker — each step

Sidebar: **1 Brief → 2 Gaps → 3 Probe → 4 Align → 5 Extract → 6 Classify → 7 Profile → 8 Coverage → 9 Search**.

### 1. Brief — confirm the job

**Feed:** nothing.  
**CARA:** no.

Read location, country, sector, subsector, search-plan cells (national / regional / local × category). Open gaps = plan cells with no list yet.

**Confirm → Gaps.**

---

### 2. Gaps — find lists (no judgement)

**Feed:**

- **Warm-start from catalogue** if the board is empty (reuses KvK / already CARA-locked lists).
- **Add** name + URL under a plan cell (Human candidate).
- **Copy Job 1 prompt** → Qwen / agent → **paste Job 1 JSON** (discover sources). Import writes **candidates**, unprobed. Ω never auto-accepts.

**Not CARA — selection only:**

| Button | Effect |
|--------|--------|
| **Keep** | Candidate → `draft` (you want this list). |
| **Ready for CARA** | Draft → `pending_review` (queue Align). |
| **Send all drafts to CARA** | Every draft → `pending_review`. |
| **Remove** | Reject — do not rate it. |

Multiple lists per category is fine. Do not decide weight here.

Then **Probe** and/or **Continue to Align**.

---

## Lists vs jobs (OVZH never gets a painter tag)

Search does **not** read a painter flag on the company or on OVZH. It finds a **job** (`missions.subsector` is `paint`, or a live alias such as Painters) and loads every company sitting on that job.

| Object | Holds the trade? |
|--------|------------------|
| OVZH source | No — it is a local mixed list |
| Florist company | No — only `list_membership: OVZH` |
| Job `Haarlemmermeer · Painters` | **Yes** — that is the shelf |

**OVZH never needs a search sector.** Sector lists (Vakwerk+, Echte Installateur) say *what they do*. OVZH is a **second mention** (local presence badge). A painter on both shows `On: Vakwerk+, OVZH`. A florist stays unknown in Local Directory and does not appear in painter search.

If OVZH was imported onto a Painters job (old town search): Mission Control → that job → **Peel mixed-only**. Florists move to Local Directory. Firms that also have Vakwerk+ stay. Then re-attach the same OVZH CSV as **Mixed list** so installers get the badge too.

**Optional AI (Classify):** do **not** send the whole OVZH file “are these painters?”. After peel, open Data Worker **Classify**, copy Job 6, paste JSON. That only asks *is this leftover a home-service at all?* Then **Agree · promote** onto the right pack. Skip Classify if you are happy that trade comes only from sector lists.

---

### 3. Probe — learn the list shape

**Feed:**

- **Probe** / **Probe all unprobed** (stub Ω today — richness + extraction guide).
- Or **Copy Job 2 prompt** → paste **Job 2 JSON**.

**CARA:** no.

If Ω cannot scrape (login, captcha, PDF, paywall), an **access barrier** is raised. That is a human **fulfil** on Extract (paste rows, note a file, decline) — not Agree/Dissent.

Then Align (to lock the source) and Extract (to get companies).

---

### 4. Align — CARA on **sources** (the main lock)

**Path:** Data Worker → **Align** (`/work/:id/align`).  
Same idea on Investigation → CARA (sources).

**Feed:** nothing. You judge Ω / Human / import proposals.

**Queue:** `draft`, `pending_review`, and **probed candidates**.

| Button | Needs reason? | Result |
|--------|---------------|--------|
| **Agree** | No | Status `accepted`. Suggested weight/confidence kept. List counts in search coverage. |
| **Adjust** | Yes (min 8 chars) | Status `adjusted`. You set weight, confidence, scope, region. |
| **Dissent** | Yes (min 8 chars) | Status `rejected`. Weight 0. Dissent is kept, not erased. |

Extract does **not** wait for this queue. Ranking **should**: only `accepted` / `adjusted` lists are trusted. Import without Align marks the list **ImportedDataset** — Align later.

Do this **after every new list** (Vakwerk+, OVHZ, sponsor club) so search weights are honest.

---

### 5. Extract — companies onto the pack

**Feed (daily):** paste/upload CSV, pick the **source list**, set membership label, import.

If the source is not yet accepted: **Accept as imported list (skip Align)** then import — Align still later.

**Feed (Ω path):** Copy Job 3 prompt / working pack → paste **companies[] JSON**. Or fulfil barriers, then **Ask Ω Extract** (stub).

**CARA:** not on this screen. Mixed CSV: matches go onto sector packs; leftovers become directory **unknowns** → step 6.

Re-run the same file is safe (merge, no duplicate firms).

---

### 6. Classify — bijvangst (mixed leftovers)

Only needed after a **mixed** import. Niche lists (Vakwerk+) skip this.

**Feed:** **Copy Job 6 prompt** (unknowns from the country **Local Directory**) → paste **classify JSON**.

Import writes **suggestions only** (`home_service` / `not_service` / `unknown`). Bakers stay unknown. Cheap name tokens + website check for potentials — not a full profile harvest.

**CARA — here:**

| Button | Result |
|--------|--------|
| **Agree · promote** | Human CARA. Company moves onto the suggested (or current) **sector pack**. Now searchable as that trade. |

Do **not** promote without looking. Wrong trade pollutes Painters (or any pack). There is no auto-promote.

Source weights still live on **Align**, not here.

---

### 7. Profile — optional depth

**Feed:** nothing required. **Can** chips already come from CSV `services`.

**Harvest** is a **stub** until live OmegaClaw — it does not invent VvE/consumer/colour advice from a website.

**CARA:** no. Skip unless you are testing harvest.

---

### 8. Coverage — read the score

**Feed:** nothing. **CARA:** no.

Shows completeness %, plan cells filled, trusted sources, companies, KvK pass rate, barriers. “Ready for search” is a quality hint. Search still works as soon as companies exist.

If not ready: chase Gaps / Probe / Align / barriers / Profile from the links on the page.

---

### 9. Search (worker) and Single Search

**Worker Search:** top 5 **in this job** + link to full search.

**Single Search** (`/search`): type e.g. `wespen / Lisse / vve`. Reads the **country × trade door** (`pest`), filters by town / 4-digit postcode cluster and For (`hoa`), excludes `unknown` and local-directory missions. Specialisation queries **boost** matching Can tags; empty Can is still shown. Score = **independent trusted-list evidence**: one accepted list is a real signal (~65–75 depending on weight); a second list corroborates and ranks higher. Lists the firm is not on do not pull the score down.

**CARA — optional, on the result:**

| Button | Needs reason? | Result |
|--------|---------------|--------|
| **Agree** | No | Company review recorded (does not change list membership). |
| **Adjust** | Yes + score | Human score + reason. |
| **Disagree** | Yes | Dissent preserved. |

Use this when a ranked answer looks wrong — not instead of Align on the source list.

---

## CARA cheat sheet

CURAD is the volunteer loop. Each Agree / Adjust / Dissent is a **CARA**.

| What you are locking | Where to click | Typical moment |
|----------------------|----------------|----------------|
| **List trust weight** | Worker **Align**, or Investigation **CARA (sources)** | After onboard, Keep, or Probe |
| **Promote unknown → trade** | Worker **Classify → Agree · promote** | After Job 6 JSON |
| **This search result** | Single Search buttons under a company | After you search |
| **Company notebook review** | Investigation **CARA (companies)** | Optional; status stays candidate/target |

**Agree** = evidence + suggested score look right (one click).  
**Adjust / Dissent** = always a written reason (min 8 characters).

Suggested confidence is **not** a decision until you CARA.

---

## Ω copy-paste jobs (until live API)

On Gaps / Probe / Extract / Classify, **Copy prompt** → paste into Qwen (or Cursor) → paste **strict JSON** back (no markdown).

| Job | Step | JSON does | CARA after? |
|-----|------|-----------|-------------|
| 1 Discover | Gaps | Candidate sources | Yes — Align |
| 2 Probe | Probe | Richness, guide, barriers | Align still for weight |
| 3 Extract | Extract | Company rows | Source should already be accepted/adjusted |
| 6 Classify | Classify | Verdicts on unknowns | Yes — Agree · promote |

Job 4 Harvest (Profile) is stubbed. Do not expect real websites to be read.

Producer badges: `Human`, `OmegaClaw`, `ExternalAI`, `ImportedDataset`. You always see who wrote the fact.

---

## Recommended NL Painters loop

1. National niche list (Vakwerk+) → Mission Control, **not** mixed, audience private, weight high → Align Agree.
2. Other national / qualification lists the same way.
3. Local mixed list (OVHZ, business club) → **Mixed** on, location = town, weight lower → onboard → Align Adjust if 65 is wrong.
4. Classify leftovers → promote only real home-service trades.
5. Search `painter / Hoofddorp`. Expect national members whose postcode sits in that cluster **plus** overlay badges — not a new Hoofddorp mission.
6. Repeat for the next list. Coverage grows; Single Search stays the same question.

---

## Do not

- Create a **town mission** per search. Attach the list to the **national pack**.
- Drop mixed-list rows you cannot match. They belong in **Local Directory** as `unknown`.
- Promote a baker (or any non-trade) onto Painters.
- Copy the HandyHouseHelp `companies` table into H3.
- Treat Ω JSON import as CARA. Import = proposal. CARA = human lock.
- Invent companies, KvK numbers, or member-list URLs.
- Skip Align forever if you care about ranking: imported lists without Agree/Adjust do not count as trusted coverage.

---

## If search looks empty

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| 0–1 painters in a town | National list has no postcodes in that cluster; no local overlay | Attach a local mixed/niche list; check cluster hit count on onboard |
| Score still looks thin | Source weight is low, or only one list hit | Align the list weight; attach another independent painter list. Extra pack lists no longer dilute a single-hit firm |
| Mixed OV names as “painters” | Mixed box off, or promoted blindly | Re-import as mixed; Classify instead of dumping onto the pack |
| Cannot save | Not approved CURAD | Sign in; wait for admin on `/admin/volunteers` |

---

## Investigation notebook (optional)

`/missions/:id` — journal, observations, hypotheses, signals. Use when you need a paper trail beyond production. **CARA (sources)** and **CARA (companies)** live here too. Daily ops: Mission Control + Data Worker + Search is enough.
