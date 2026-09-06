import type { Mission, SearchPlanEntry, Source } from "@h3-trust/schema";
import soulManifest from "../../../../fixtures/samples/H3TrustSoul.md?raw";

function withSoul(task: string): string {
  const soul = String(soulManifest ?? "").trim();
  if (!soul) return task;
  return `${soul}\n\n---\n\n${task}`;
}

/** Clipboard text for offline Job 1 (Qwen / manual Ω) — gaps envelope preferred. */
export function buildDiscoverJobPrompt(args: {
  mission: Mission;
  planEntries: SearchPlanEntry[];
  sources: Source[];
  openGaps?: Array<{ layer: string; category: string; nuance_rule?: string }>;
}): string {
  const { mission, planEntries, sources } = args;
  const existing = sources.map((s) => ({
    name: s.name,
    category: s.category,
    scope: s.scope,
    status: s.status,
    depth: s.depth,
    listUrl: s.listUrl,
  }));

  const open =
    args.openGaps ??
    planEntries.map((e) => ({
      layer: e.layer,
      category: e.category,
      nuance_rule: e.nuance_rule,
    }));

  return withSoul(`You are OmegaClaw discovering trust lists for H3 Trust Harness.

Fill ONLY the open_gaps (each is layer × category + nuance_rule).
Return real, currently active sources with public (or clearly listable) company members.
Do not invent URLs or names. If none exists for a gap, return found=false for that gap.
Do not duplicate existing_sources.
scope must equal the gap layer. regional/local → region = mission location; national → region = "".
status will be set to candidate by the harness. Do not claim acceptance.
suggestedWeight is a proposal (soft sources ≤ 90; identity registry / search-form cap 30).

DEFINITION OF DONE — LIST SURFACE REQUIRED:
found=true only when you can name a concrete listUrl (member list, searchable register,
vacancy board, or finder) that can yield company names for THIS sector × location.
Brand / about / marketing homepages alone are NOT enough → found=false (or report the
authority with depth="shallow" only if you also raise accessBarrier / explain the missing hop).
Prefer listUrl as the operational URL; put the parent org on discoveredVia (and optionally url).
Set depth: "list_ready" when listUrl (or equivalent search URL) is real; otherwise "shallow".
Record filterHints when the list needs trade/region codes (e.g. SBI, SBB opleiding codes).

DISCOVERY PATTERN — PLATFORM CASCADE:
When a gap has no direct list source, search for PLATFORMS that power such lists
(sponsor management tools, business club software, directory engines). If found,
enumerate their clients in the target region and treat each client's public page
as a candidate source. Report the platform as discoveredVia on each source.

DISCOVERY PATTERN — AUTHORITY → DATA SURFACE:
If you find a recognising body, regulator, keurmerk umbrella, or training authority
(e.g. SBB, KvK, national quality-mark orgs), do NOT stop at the corporate homepage.
Follow one hop to the operational register / search / member finder / vacancy board
where companies appear (e.g. SBB → zoeken-mijn.s-bb.nl / Stagemarkt / Leerbanenmarkt).
Prefer that URL as listUrl. Put the parent on discoveredVia.
If only the parent exists and no public company surface is reachable for this trade,
return found=false (authority-only is not a filled gap).

GOLD EXEMPLARS (match this depth):
1) SponsorVisie → Business Club SV Hoofddorp → listUrl=/leden, listRenderType=images,
   discoveredVia=sponsorvisie.nl
2) SBB (erkend leerbedrijf) → listUrl=zoeken-mijn.s-bb.nl (or Stagemarkt/Leerbanenmarkt),
   filterHints="painter codes 25589 / 1786 / 27005", discoveredVia=s-bb.nl — NOT s-bb.nl alone
3) Trade association homepage → member finder / vind-een-bedrijf URL with region filter,
   not the about page

LIST RENDER TYPE:
For each source, set listRenderType: "text" | "images" | "js-app" | "pdf".
If "images" or "js-app", do NOT mark found=false only because a text agent cannot
read the list — mark found=true, set listRenderType, depth=list_ready, and raise accessBarrier
(kind can be "unknown") noting that a vision / browser step is needed.

Mission context:
${JSON.stringify(
  {
    country: mission.country,
    location: mission.location,
    sector: mission.sector,
    subsector: mission.subsector,
    goal: mission.goal,
  },
  null,
  2,
)}

Open gaps:
${JSON.stringify(open, null, 2)}

Existing sources (do not duplicate):
${JSON.stringify(existing, null, 2)}

OUTPUT: strict JSON only. Prefer the Qwen-compatible envelope:

{
  "gaps": [
    {
      "layer": "national" | "regional" | "local",
      "category": "<search-plan category>",
      "found": true,
      "sources": [
        {
          "name": "...",
          "url": "https://parent-or-same-as-list",
          "listUrl": "https://.../search-or-leden",
          "scope": "national",
          "region": "",
          "suggestedWeight": 80,
          "suggestedConfidence": 85,
          "memberListPublic": true,
          "membershipBarrier": "high" | "medium" | "low" | "unknown",
          "motivation": "...",
          "discoveredVia": "optional platform / parent URL",
          "filterHints": "optional trade/region filter codes",
          "depth": "list_ready" | "shallow",
          "listRenderType": "text" | "images" | "js-app" | "pdf",
          "accessBarrier": null
        }
      ]
    },
    {
      "layer": "local",
      "category": "sponsorship",
      "found": false,
      "sources": [],
      "motivation_not_found": "..."
    }
  ]
}

No markdown.`);
}

export function buildProbeJobPrompt(args: {
  mission: Mission;
  sources: Source[];
}): string {
  const targets = args.sources
    .filter((s) => s.probeStatus !== "probed")
    .map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      listUrl: s.listUrl,
      category: s.category,
      scope: s.scope,
      region: s.region,
      reason: s.reason,
      depth: s.depth,
      filterHints: s.filterHints,
      discoveredVia: s.discoveredVia,
    }));

  return withSoul(`You are OmegaClaw probing trust sources for H3 Trust Harness (Job 2).

For EACH source below, determine: live URL? public member list? membership barrier
(high|medium|low|unknown)? list render type (text|images|js-app|pdf)?
extraction guide fields ONLY from this closed set:
[name, website, address, phone, email, image, kvk, specialism, tier]
Raise accessBarrier when you cannot extract companies yourself (never bypass auth/captcha/paywall).

DEFINITION OF DONE — PROOF OR BARRIER:
Essay-only success is a FAILURE. For each source you MUST either:
  (a) return sampleCompanies: 1–3 real company names visible on the list/search for this
      mission (with optional note), plus extractionGuide, OR
  (b) raise accessBarrier with severity "blocks-extract" explaining what blocks you.
If the source is still only a parent homepage (depth shallow), hop once to listUrl /
register / search / leden and correct listUrl + filterHints. Prefer list_ready depth.

RULES (non-negotiable):
- Output ONE shape only — the contract below. Do NOT invent field names (no sourceName,
  sourceUrl, summaryReasons string, accessBarrier.details, confidence 0–1 floats).
- Match each probe with name EXACTLY as given in Sources to probe (copy-paste).
  Also set sourceId to the source id when present.
- suggestedConfidence is an INTEGER 0–100 (e.g. 85), never 0.85.
- membership_threshold / membershipBarrier enum: "high" | "medium" | "low" | "unknown"
- extractionGuide.fields MUST be a subset of sourceFields.
- listPattern enum: "table" | "cards" | "directory" | "map" | "json-api" | "search-form" | "unknown"
- accessBarrier when needed MUST use kind + severity + what_omega_needs + what_human_does
  (harness fills id/raised_at). kind enum:
  "api-key-application" | "email-request" | "manual-lookup" | "login-wall" | "captcha" |
  "paid-tier" | "pdf-download" | "rate-limited" | "unknown"
  severity enum: "blocks-extract" | "partial" | "soft"
- summary_reasons is an ARRAY of strings with ✓ / ✗ / ? prefixes.
- No markdown. No prose outside JSON.

Mission:
${JSON.stringify(
  {
    country: args.mission.country,
    location: args.mission.location,
    sector: args.mission.sector,
    subsector: args.mission.subsector,
  },
  null,
  2,
)}

Sources to probe:
${JSON.stringify(targets, null, 2)}

OUTPUT: strict JSON only, exactly this envelope (one object per source):

{
  "probes": [
    {
      "sourceId": "<uuid from Sources to probe.id when present>",
      "name": "<exact name from Sources to probe>",
      "url": "https://...",
      "listUrl": "https://.../leden-or-search",
      "suggestedConfidence": 85,
      "sourceFields": ["name", "website", "address"],
      "extractionGuide": {
        "listPattern": "directory",
        "fields": ["name", "website"],
        "pagination": false,
        "regionFilter": "Hoofddorp",
        "filterHints": "optional trade codes",
        "notes": "how to extract"
      },
      "evidence": {
        "url": "https://.../leden-or-search",
        "membership_threshold": "medium",
        "summary_reasons": [
          "✓ Public member list verified",
          "? Medium barrier — paid membership"
        ],
        "sample_companies": [
          { "name": "Example BV", "note": "visible on list" }
        ]
      },
      "sampleCompanies": [
        { "name": "Example BV", "note": "visible on list" }
      ],
      "accessBarrier": null
    },
    {
      "sourceId": "<uuid>",
      "name": "KVK Handelsregister",
      "url": "https://www.kvk.nl",
      "listUrl": "https://www.kvk.nl/zoeken",
      "suggestedConfidence": 70,
      "sourceFields": ["name", "kvk", "address"],
      "extractionGuide": {
        "listPattern": "search-form",
        "fields": ["name", "kvk", "address"],
        "pagination": false,
        "filterHints": "SBI 4334",
        "notes": "Bulk extract blocked; single lookup only"
      },
      "evidence": {
        "url": "https://www.kvk.nl/zoeken",
        "membership_threshold": "high",
        "summary_reasons": [
          "✓ Authoritative registry",
          "✗ Bulk extract requires paid API / human lookup"
        ]
      },
      "sampleCompanies": [],
      "accessBarrier": {
        "kind": "manual-lookup",
        "severity": "blocks-extract",
        "what_omega_needs": "Bulk list of SBI-4334 companies in mission location",
        "what_human_does": "Use free single lookup per company, or purchase bulk/API access",
        "free_tier_available": true
      }
    }
  ]
}`);
}

/** Slim working-source row for Job 3 offline packs (manual / Kimi / Qwen). */
export type ExtractWorkingSource = {
  id: string;
  name: string;
  status: "accepted" | "adjusted";
  url?: string;
  listUrl?: string;
  category: string;
  scope: string;
  region?: string;
  depth?: string;
  listRenderType?: string;
  filterHints?: string;
  sourceFields?: string[];
  guide?: Source["extractionGuide"];
  sampleCompanies?: Array<{ name: string; note?: string }>;
  accessBarrier?: {
    kind: string;
    severity: string;
    what_human_does?: string;
    status?: string;
  } | null;
  suggestedConfidence?: number;
  suggestedWeight?: number;
};

export function trustedSourcesForExtract(sources: Source[]): Source[] {
  return sources.filter(
    (s) => s.status === "accepted" || s.status === "adjusted",
  );
}

export function toExtractWorkingSource(s: Source): ExtractWorkingSource {
  const samples =
    s.evidence?.sample_companies?.map((c) =>
      c.note ? { name: c.name, note: c.note } : { name: c.name },
    ) ?? undefined;
  const barrier = s.accessBarrier
    ? {
        kind: s.accessBarrier.kind,
        severity: s.accessBarrier.severity,
        what_human_does: s.accessBarrier.what_human_does,
        status: s.accessBarrier.status,
      }
    : null;

  return {
    id: s.id,
    name: s.name,
    status: s.status as "accepted" | "adjusted",
    url: s.url,
    listUrl: s.listUrl,
    category: s.category,
    scope: s.scope,
    region: s.region || undefined,
    depth: s.depth,
    listRenderType: s.listRenderType,
    filterHints: s.filterHints || s.extractionGuide?.filterHints,
    sourceFields: s.sourceFields?.length ? s.sourceFields : undefined,
    guide: s.extractionGuide,
    sampleCompanies: samples?.length ? samples : undefined,
    accessBarrier: barrier,
    suggestedConfidence: s.suggestedConfidence,
    suggestedWeight: s.suggestedWeight,
  };
}

/** Downloadable Job 3 pack — mission context + CURAD-approved working sources. */
export function buildExtractWorkingPack(args: {
  mission: Mission;
  sources: Source[];
}): {
  job: "extract";
  generatedAt: string;
  mission: {
    id: string;
    country: string;
    location: string;
    sector: string;
    subsector?: string;
    goal?: string;
  };
  working_sources: ExtractWorkingSource[];
} {
  const trusted = trustedSourcesForExtract(args.sources);
  return {
    job: "extract",
    generatedAt: new Date().toISOString(),
    mission: {
      id: args.mission.id,
      country: args.mission.country,
      location: args.mission.location,
      sector: args.mission.sector,
      subsector: args.mission.subsector,
      goal: args.mission.goal,
    },
    working_sources: trusted.map(toExtractWorkingSource),
  };
}

export function buildExtractJobPrompt(args: {
  mission: Mission;
  sources: Source[];
}): string {
  const pack = buildExtractWorkingPack(args);
  return withSoul(`You are OmegaClaw extracting companies from working trust lists (Job 3).

Extract ONLY from the sources listed. Do not invent companies.
Record list_membership (source names) for every company.
kvk_gate = "pass" only if an 8-digit KvK is visible; else "unchecked".
Use listUrl and guide.filterHints / regionFilter when present.
Never invent URLs, KvK numbers, or firms from general knowledge.
If a source has accessBarrier with severity "blocks-extract" and status is not
fulfilled, skip it and mention it in discovery_notes — do not bypass.

Mission:
${JSON.stringify(pack.mission, null, 2)}

Working sources (CURAD accepted/adjusted):
${JSON.stringify(pack.working_sources, null, 2)}

OUTPUT: strict JSON only. No markdown.

{
  "companies": [
    {
      "name": "…",
      "address": "optional",
      "region": "optional",
      "kvk_number": "optional 8 digits",
      "kvk_gate": "pass" | "unchecked",
      "list_membership": ["Exact Source Name"],
      "fieldsExtracted": ["name"],
      "specialism": "optional"
    }
  ]
}`);
}

export function buildClassifyJobPrompt(args: {
  mission: { country: string; location: string };
  companies: Array<{
    id: string;
    name: string;
    website_url?: string;
    address?: string;
    region?: string;
  }>;
}): string {
  const slice = args.companies.slice(0, 80);
  return withSoul(`You are OmegaClaw classifying mixed-list bijvangst for H3 Trust Harness.

These companies came from an ondernemersvereniging, sportclub, or similar mixed list.
They are NOT a trade until classified. Bakers stay unknown.

Cheap pass: name tokens (schilder, elektra, dak, hovenier, groen, tuin, klus, onderhoud, installatie, loodgieter).
Website check ONLY for potentials. Do not harvest Can/For/Notable.

Country: ${args.mission.country}
Place context: ${args.mission.location}

Companies:
${JSON.stringify(slice, null, 2)}

OUTPUT: strict JSON only.

{
  "producer": "OmegaClaw",
  "verdicts": [
    {
      "companyId": "uuid from input",
      "name": "…",
      "verdict": "home_service" | "not_service" | "unknown",
      "suggestedSubsector": "Painters | Electricians | Roofing | Groen | Klus",
      "confidence": "high" | "medium" | "low",
      "websiteChecked": false,
      "notes": "optional"
    }
  ]
}

A human CARA step must agree before anyone is promoted onto a sector pack.`);
}
