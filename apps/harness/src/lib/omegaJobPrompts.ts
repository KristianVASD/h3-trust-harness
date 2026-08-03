import type { Mission, SearchPlanEntry, Source } from "@h3-trust/schema";

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

  return `You are OmegaClaw discovering trust lists for H3 Trust Harness.

Fill ONLY the open_gaps (each is layer × category + nuance_rule).
Return real, currently active sources with public (or clearly listable) company members.
Do not invent URLs or names. If none exists for a gap, return found=false for that gap.
Do not duplicate existing_sources.
scope must equal the gap layer. regional/local → region = mission location; national → region = "".
status will be set to candidate by the harness. Do not claim acceptance.
suggestedWeight is a proposal (soft sources ≤ 90; hard identity registry ≤ 95).

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

No markdown.`;
}

export function buildProbeJobPrompt(args: {
  mission: Mission;
  sources: Source[];
}): string {
  const targets = args.sources
    .filter((s) => s.probeStatus !== "probed")
    .map((s) => ({
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

  return `You are OmegaClaw probing trust sources for H3 Trust Harness (Job 2).

For EACH source below, determine: live URL? public member list? membership barrier?
list render type (text|images|js-app|pdf)? extraction guide fields from
[name, website, address, phone, email, image, kvk, specialism, tier]?
Raise accessBarrier when you cannot extract companies yourself (never bypass auth/captcha/paywall).

DEFINITION OF DONE — PROOF OR BARRIER:
Essay-only success is a FAILURE. For each source you MUST either:
  (a) return sampleCompanies: 1–3 real company names visible on the list/search for this
      mission (with optional note), plus extractionGuide, OR
  (b) raise accessBarrier with severity "blocks-extract" explaining what blocks you.
If the source is still only a parent homepage (depth shallow), hop once to listUrl /
register / search / leden and correct listUrl + filterHints. Prefer list_ready depth.

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

OUTPUT: strict JSON array (or { "probes": [ ... ] }). Each item may be frozen ProbeOutput
or a narrative object with source.name / source.url / listUrl, suggestedConfidence,
summary_reasons, accessBarrier, sampleCompanies (or knownSponsorsVerified), and either
extractionGuide+sourceFields or investigation.publicMemberList.

No markdown.`;
}

export function buildExtractJobPrompt(args: {
  mission: Mission;
  sources: Source[];
}): string {
  const trusted = args.sources.filter(
    (s) => s.status === "accepted" || s.status === "adjusted",
  );
  return `You are OmegaClaw extracting companies from working trust lists (Job 3).

Extract ONLY from the sources listed. Do not invent companies.
Record list_membership (source names) for every company.
kvk_gate = "pass" only if an 8-digit KvK is visible; else "unchecked".
Use listUrl and extractionGuide.filterHints / regionFilter when present.

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

Working sources:
${JSON.stringify(
  trusted.map((s) => ({
    name: s.name,
    url: s.url,
    listUrl: s.listUrl,
    category: s.category,
    scope: s.scope,
    filterHints: s.filterHints,
    guide: s.extractionGuide,
  })),
  null,
  2,
)}

OUTPUT: strict JSON:
{ "companies": [ { "name", "address?", "region?", "kvk_number?", "list_membership": ["Source Name"], "specialism?" } ] }

No markdown.`;
}
