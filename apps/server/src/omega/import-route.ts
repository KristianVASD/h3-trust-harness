/**
 * Manual Ω JSON import — paste/upload job envelopes without a live API.
 * Normalizes Qwen / OmegaClaw.md / frozen shapes, then reuses adapter builders.
 */
import { v4 as uuid } from "uuid";
import {
  computeRichness,
  isBlockingBarrier,
  type AccessBarrier,
  type BarrierKind,
  type Company,
  type MembershipThreshold,
  type Source,
  type SourceCategory,
  type SourceFieldKey,
  type SourceScope,
  type SourceType,
} from "@h3-trust/schema";
import {
  DiscoverOutputSchema,
  ExtractOutputSchema,
  HarvestOutputSchema,
  ProbeOutputSchema,
  type DiscoverCandidate,
  type DiscoverOutput,
  type ExtractCompany,
  type ExtractOutput,
  type HarvestOutput,
  type ProbeOutput,
} from "@h3-trust/schema/omega";
import type { Store } from "@h3-trust/store";
import {
  buildDiscoverSourceRecords,
  buildExtractCompanyRecords,
  buildHarvestCompanyPatch,
  buildProbeSourcePatch,
} from "./adapter.js";

const SCOPES = new Set<SourceScope>(["national", "regional", "local"]);
const CATEGORIES = new Set<string>([
  "registry",
  "branch_association",
  "quality_mark",
  "local_business_association",
  "internship_market",
  "labor_market_presence",
  "sector_qualification",
  "trade_fair",
  "sponsorship",
  "local_media",
  "peer_referral",
  "digital_presence",
  "networking_group",
  "municipal_initiative",
]);
const TYPES = new Set<string>([
  "registry",
  "association",
  "directory",
  "website",
  "municipality",
  "news",
  "other",
]);
const THRESHOLDS = new Set<string>(["low", "medium", "high", "unknown"]);
const BARRIER_KINDS = new Set<string>([
  "api-key-application",
  "email-request",
  "manual-lookup",
  "login-wall",
  "captcha",
  "paid-tier",
  "pdf-download",
  "rate-limited",
  "unknown",
]);

const BARRIER_KIND_ALIASES: Record<string, BarrierKind> = {
  "no-public-list": "unknown",
  "js-rendered-images": "unknown",
  "js-app": "unknown",
  images: "unknown",
  vision: "unknown",
};

export type ImportJob = "discover" | "probe" | "extract" | "harvest";

export type ImportRouteResult = {
  job: ImportJob;
  imported: number;
  skipped: Array<{ reason: string; detail?: string }>;
  sources?: Source[];
  companies?: Company[];
  warnings: string[];
};

export class ImportRouteError extends Error {
  status: 400 | 404 | 500;
  constructor(message: string, status: 400 | 404 | 500 = 400) {
    super(message);
    this.name = "ImportRouteError";
    this.status = status;
  }
}

type DiscoverExtras = {
  membershipBarrier?: MembershipThreshold;
  memberListPublic?: boolean;
  accessBarrier?: AccessBarrier;
  discoveredVia?: string;
  listRenderType?: string;
  listUrl?: string;
  filterHints?: string;
  depth?: "shallow" | "list_ready";
  /** Homepage / parent when listUrl is the primary surface. */
  orgUrl?: string;
};

export async function runOmegaImport(
  store: Store,
  missionId: string,
  body: unknown,
): Promise<ImportRouteResult> {
  if (!body || typeof body !== "object") {
    throw new ImportRouteError("Body must be { job, payload }");
  }
  const raw = body as Record<string, unknown>;
  const job = String(raw.job ?? "").trim() as ImportJob;
  if (!["discover", "probe", "extract", "harvest"].includes(job)) {
    throw new ImportRouteError(
      'job must be "discover" | "probe" | "extract" | "harvest"',
    );
  }
  const payload = raw.payload ?? raw.output ?? raw;
  const mission = await store.getMission(missionId);
  if (!mission) throw new ImportRouteError("Mission not found", 404);

  if (job === "discover") {
    return importDiscover(store, missionId, payload);
  }
  if (job === "probe") {
    return importProbe(store, missionId, payload);
  }
  if (job === "extract") {
    return importExtract(store, missionId, payload);
  }
  return importHarvest(store, missionId, payload);
}

/* ----------------------------- discover ---------------------------------- */

async function importDiscover(
  store: Store,
  missionId: string,
  payload: unknown,
): Promise<ImportRouteResult> {
  const { candidates, extrasByName, warnings } = normalizeDiscoverPayload(
    payload,
    missionId,
  );
  const output = DiscoverOutputSchema.parse({
    producer: "OmegaClaw",
    missionId,
    candidates,
  }) satisfies DiscoverOutput;

  const existing = await store.listByMission("sources", missionId);
  const existingNames = new Set(
    existing.map((s) => s.name.trim().toLowerCase()),
  );

  const { sources: drafts, skipped: discoverSkipped } =
    buildDiscoverSourceRecords(output, missionId);

  const skipped: ImportRouteResult["skipped"] = discoverSkipped.map((s) => ({
    reason: s.reason,
    detail: s.candidate.category
      ? `${s.candidate.scope ?? "?"} × ${s.candidate.category}`
      : undefined,
  }));

  const sources: Source[] = [];
  for (const draft of drafts) {
    const key = draft.name.trim().toLowerCase();
    if (existingNames.has(key)) {
      skipped.push({
        reason: `Already on mission: ${draft.name}`,
        detail: draft.url,
      });
      continue;
    }
    const enriched = enrichDiscoverSource(draft, extrasByName.get(key));
    const saved = await store.createSourceInMission(missionId, enriched);
    existingNames.add(key);
    sources.push(saved);
  }

  return {
    job: "discover",
    imported: sources.length,
    skipped,
    sources,
    warnings,
  };
}

function normalizeDiscoverPayload(
  payload: unknown,
  _missionId: string,
): {
  candidates: DiscoverCandidate[];
  extrasByName: Map<string, DiscoverExtras>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const extrasByName = new Map<string, DiscoverExtras>();
  const candidates: DiscoverCandidate[] = [];

  if (!payload || typeof payload !== "object") {
    throw new ImportRouteError("Discover payload must be a JSON object");
  }
  const p = payload as Record<string, unknown>;

  // Frozen contract
  if (Array.isArray(p.candidates)) {
    for (const c of p.candidates) {
      pushDiscoverItem(c, null, null, candidates, extrasByName, warnings);
    }
    return { candidates, extrasByName, warnings };
  }

  // OmegaClaw.md
  if (Array.isArray(p.discovered_sources)) {
    for (const c of p.discovered_sources) {
      pushDiscoverItem(c, null, null, candidates, extrasByName, warnings);
    }
    return { candidates, extrasByName, warnings };
  }

  // Qwen gaps envelope
  if (Array.isArray(p.gaps)) {
    for (const gapRaw of p.gaps) {
      if (!gapRaw || typeof gapRaw !== "object") continue;
      const gap = gapRaw as Record<string, unknown>;
      const layer = asScope(gap.layer);
      const category = asCategory(gap.category);
      const found = gap.found !== false;
      const sources = Array.isArray(gap.sources) ? gap.sources : [];

      if (!found || sources.length === 0) {
        candidates.push({
          found: false,
          category: category ?? undefined,
          scope: layer ?? undefined,
          reason:
            str(gap.motivation_not_found) ||
            str(gap.reason) ||
            "No source found for this gap.",
        });
        continue;
      }

      for (const src of sources) {
        pushDiscoverItem(src, layer, category, candidates, extrasByName, warnings);
      }
    }
    return { candidates, extrasByName, warnings };
  }

  // Bare array of sources
  if (Array.isArray(payload)) {
    for (const c of payload) {
      pushDiscoverItem(c, null, null, candidates, extrasByName, warnings);
    }
    return { candidates, extrasByName, warnings };
  }

  throw new ImportRouteError(
    'Discover payload needs gaps[], discovered_sources[], or candidates[]',
  );
}

function pushDiscoverItem(
  raw: unknown,
  defaultScope: SourceScope | null,
  defaultCategory: SourceCategory | null,
  candidates: DiscoverCandidate[],
  extrasByName: Map<string, DiscoverExtras>,
  warnings: string[],
): void {
  if (!raw || typeof raw !== "object") return;
  const s = raw as Record<string, unknown>;

  if (s.found === false) {
    candidates.push({
      found: false,
      category: asCategory(s.category) ?? defaultCategory ?? undefined,
      scope: asScope(s.scope) ?? defaultScope ?? undefined,
      region: str(s.region) ?? "",
      reason: str(s.reason) || str(s.motivation) || "Not found",
    });
    return;
  }

  const name = str(s.name);
  if (!name) {
    warnings.push("Skipped a source with no name");
    return;
  }

  const category =
    asCategory(s.category) ?? defaultCategory ?? "digital_presence";
  const scope = asScope(s.scope) ?? defaultScope ?? "regional";
  const reason = str(s.reason) || str(s.motivation);
  const type = asType(s.type) ?? inferType(category);

  const listUrl = str(s.listUrl);
  const orgUrl = str(s.url);
  const filterHints = str(s.filterHints) || str(s.filter_hints);
  const via = str(s.discoveredVia);
  const render = str(s.listRenderType);
  const explicitDepth = asDepth(s.depth);

  // Prefer list/search surface as primary url; keep brand homepage in extras.
  const primaryUrl = listUrl || orgUrl;
  const inferredDepth =
    explicitDepth ??
    (listUrl || filterHints
      ? "list_ready"
      : primaryUrl
        ? "shallow"
        : undefined);

  candidates.push({
    found: true,
    name,
    type,
    category,
    scope,
    region: str(s.region) ?? (scope === "national" ? "" : undefined),
    url: primaryUrl,
    listUrl: listUrl || undefined,
    discoveredVia: via || undefined,
    listRenderType: asListRenderType(render) || undefined,
    filterHints: filterHints || undefined,
    depth: inferredDepth,
    memberListPublic:
      typeof s.memberListPublic === "boolean" ? s.memberListPublic : undefined,
    reason,
    suggestedWeight: num(s.suggestedWeight),
    suggestedConfidence: num(s.suggestedConfidence),
    confidence_in_existence: asConfidence(s.confidence_in_existence),
  });

  if (inferredDepth === "shallow") {
    warnings.push(
      `Shallow discovery for "${name}": no listUrl/filterHints — prefer the register/search/leden surface (set listUrl + discoveredVia).`,
    );
  }

  const extras: DiscoverExtras = {};
  const threshold = asThreshold(s.membershipBarrier ?? s.membership_threshold);
  if (threshold) extras.membershipBarrier = threshold;
  if (typeof s.memberListPublic === "boolean") {
    extras.memberListPublic = s.memberListPublic;
  }
  if (via) extras.discoveredVia = via;
  if (render) extras.listRenderType = render;
  if (listUrl) extras.listUrl = listUrl;
  if (orgUrl && listUrl && orgUrl !== listUrl) extras.orgUrl = orgUrl;
  if (filterHints) extras.filterHints = filterHints;
  if (inferredDepth) extras.depth = inferredDepth;
  const barrier = coerceAccessBarrier(s.accessBarrier);
  if (barrier) extras.accessBarrier = barrier;

  extrasByName.set(name.trim().toLowerCase(), extras);
}

function enrichDiscoverSource(
  draft: Source,
  extras: DiscoverExtras | undefined,
): Source {
  if (!extras) return draft;
  const evidence = { ...(draft.evidence ?? { summary_reasons: [] as string[] }) };
  const reasons = [...(evidence.summary_reasons ?? [])];

  if (extras.membershipBarrier) {
    evidence.membership_threshold = extras.membershipBarrier;
  }
  if (extras.memberListPublic === true) {
    reasons.push("✓ Public member list reported");
  } else if (extras.memberListPublic === false) {
    reasons.push("✗ No public member list reported");
  }
  if (extras.listRenderType) {
    reasons.push(`? List render: ${extras.listRenderType}`);
  }
  if (extras.discoveredVia) {
    reasons.push(`? Discovered via: ${extras.discoveredVia}`);
  }
  if (extras.filterHints) {
    reasons.push(`? Filter hints: ${extras.filterHints}`);
  }
  if (extras.depth === "shallow") {
    reasons.push(
      "? Depth shallow — hop to list/search surface before treating as extractable",
    );
  } else if (extras.depth === "list_ready") {
    reasons.push("✓ Depth list_ready");
  }
  evidence.summary_reasons = reasons.length
    ? reasons
    : evidence.summary_reasons ?? [];

  const noteParts = [draft.notes].filter(Boolean) as string[];
  if (extras.discoveredVia) noteParts.push(`via: ${extras.discoveredVia}`);
  if (extras.listRenderType) {
    noteParts.push(`listRenderType: ${extras.listRenderType}`);
  }
  if (extras.orgUrl) noteParts.push(`orgUrl: ${extras.orgUrl}`);
  if (extras.filterHints) noteParts.push(`filters: ${extras.filterHints}`);

  return {
    ...draft,
    evidence,
    notes: noteParts.join(" · "),
    ...(extras.listUrl ? { listUrl: extras.listUrl } : {}),
    ...(extras.discoveredVia ? { discoveredVia: extras.discoveredVia } : {}),
    ...(extras.listRenderType
      ? {
          listRenderType: extras.listRenderType as Source["listRenderType"],
        }
      : {}),
    ...(extras.filterHints ? { filterHints: extras.filterHints } : {}),
    ...(extras.depth ? { depth: extras.depth } : {}),
    ...(typeof extras.memberListPublic === "boolean"
      ? { memberListPublic: extras.memberListPublic }
      : {}),
    ...(extras.accessBarrier ? { accessBarrier: extras.accessBarrier } : {}),
  };
}

/* ------------------------------- probe ----------------------------------- */

async function importProbe(
  store: Store,
  missionId: string,
  payload: unknown,
): Promise<ImportRouteResult> {
  const missionSources = await store.listByMission("sources", missionId);
  const items = unwrapProbeItems(payload);
  const skipped: ImportRouteResult["skipped"] = [];
  const warnings: string[] = [];
  const sources: Source[] = [];

  for (const item of items) {
    const match = resolveSource(missionSources, item);
    if (!match) {
      skipped.push({
        reason: "No matching source on mission",
        detail: str(item.sourceId) || str(item.name) || str(item.url) || "?",
      });
      continue;
    }

    try {
      const probe = normalizeProbeItem(item, missionId, match);
      const hasSamples =
        (probe.sampleCompanies?.length ?? 0) > 0 ||
        (probe.evidence.sample_companies?.length ?? 0) > 0;
      const blocked =
        probe.accessBarrier != null && isBlockingBarrier(probe.accessBarrier);
      if (!hasSamples && !blocked) {
        warnings.push(
          `Probe for "${match.name}" has no sampleCompanies and no blocks-extract barrier — essay-only evidence; prefer 1–3 real names or raise a barrier.`,
        );
      }
      const patch = buildProbeSourcePatch(probe);
      const updated = await store.upsert("sources", { ...match, ...patch });
      // refresh local list for subsequent matches
      const idx = missionSources.findIndex((s) => s.id === match.id);
      if (idx >= 0) missionSources[idx] = updated;
      sources.push(updated);
    } catch (err) {
      skipped.push({
        reason: err instanceof Error ? err.message : "Probe import failed",
        detail: match.name,
      });
    }
  }

  if (!items.length) {
    throw new ImportRouteError(
      "Probe payload needs a ProbeOutput, an array of probes, or narrative Job-2 objects",
    );
  }

  return {
    job: "probe",
    imported: sources.length,
    skipped,
    sources,
    warnings,
  };
}

function unwrapProbeItems(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter(
      (x): x is Record<string, unknown> =>
        Boolean(x) && typeof x === "object",
    );
  }
  if (typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.probes)) {
    return p.probes.filter(
      (x): x is Record<string, unknown> =>
        Boolean(x) && typeof x === "object",
    );
  }
  if (Array.isArray(p.results)) {
    return p.results.filter(
      (x): x is Record<string, unknown> =>
        Boolean(x) && typeof x === "object",
    );
  }
  // Single frozen or narrative probe
  if (p.sourceId || p.source || p.extractionGuide || p.investigation) {
    return [p];
  }
  // Minimal batch: { sources: [{ name|url|id, ...guide fields }] }
  if (Array.isArray(p.sources)) {
    return p.sources.filter(
      (x): x is Record<string, unknown> =>
        Boolean(x) && typeof x === "object",
    );
  }
  return [p];
}

function resolveSource(
  sources: Source[],
  item: Record<string, unknown>,
): Source | null {
  const id =
    str(item.sourceId) ||
    (item.source && typeof item.source === "object"
      ? str((item.source as Record<string, unknown>).id)
      : null);
  if (id) {
    const byId = sources.find((s) => s.id === id);
    if (byId) return byId;
  }

  const name =
    str(item.name) ||
    (item.source && typeof item.source === "object"
      ? str((item.source as Record<string, unknown>).name)
      : null);
  const url =
    str(item.url) ||
    (item.source && typeof item.source === "object"
      ? str((item.source as Record<string, unknown>).url) ||
        str((item.source as Record<string, unknown>).listUrl)
      : null);

  if (url) {
    const norm = normalizeUrl(url);
    const byUrl = sources.find(
      (s) => s.url && normalizeUrl(s.url) === norm,
    );
    if (byUrl) return byUrl;
  }
  if (name) {
    const key = name.trim().toLowerCase();
    const byName = sources.find((s) => s.name.trim().toLowerCase() === key);
    if (byName) return byName;
  }
  return null;
}

function normalizeProbeItem(
  item: Record<string, unknown>,
  missionId: string,
  source: Source,
): ProbeOutput {
  // Already frozen-shaped?
  if (item.extractionGuide && item.sourceFields && item.evidence) {
    const parsed = ProbeOutputSchema.safeParse({
      ...item,
      producer: "OmegaClaw",
      missionId,
      sourceId: source.id,
      accessBarrier: item.accessBarrier
        ? coerceAccessBarrier(item.accessBarrier) ?? item.accessBarrier
        : undefined,
    });
    if (parsed.success) return parsed.data;
  }

  // Narrative Job 2 (AboutManualInput-style) or minimal guide batch
  const inv =
    item.investigation && typeof item.investigation === "object"
      ? (item.investigation as Record<string, unknown>)
      : item;

  const memberList =
    inv.publicMemberList && typeof inv.publicMemberList === "object"
      ? (inv.publicMemberList as Record<string, unknown>)
      : null;

  const textExtractable =
    memberList?.textExtractable === true ||
    str(memberList?.listRenderType) === "text" ||
    item.memberListPublic === true;

  const fields: SourceFieldKey[] = Array.isArray(item.sourceFields)
    ? (item.sourceFields as SourceFieldKey[])
    : textExtractable
      ? (["name", "website", "address"] as SourceFieldKey[])
      : (["name"] as SourceFieldKey[]);

  const guideFields = Array.isArray(
    (item.extractionGuide as { fields?: unknown } | undefined)?.fields,
  )
    ? ((item.extractionGuide as { fields: SourceFieldKey[] }).fields)
    : textExtractable
      ? (["name", "website"] as SourceFieldKey[])
      : (["name"] as SourceFieldKey[]);

  const listPattern =
    (item.extractionGuide as { listPattern?: string } | undefined)
      ?.listPattern ||
    (str(memberList?.listRenderType) === "images"
      ? "cards"
      : textExtractable
        ? "directory"
        : "unknown");

  const summary =
    Array.isArray(item.summary_reasons)
      ? (item.summary_reasons as string[])
      : Array.isArray(inv.summary_reasons)
        ? (inv.summary_reasons as string[])
        : [
            textExtractable
              ? "✓ Member list reported extractable"
              : "? List may need vision or human extract",
          ];

  const barrier =
    coerceAccessBarrier(item.accessBarrier) ||
    coerceAccessBarrier(inv.accessBarrier);

  const threshold = asThreshold(
    item.membershipBarrier ??
      inv.membershipBarrier ??
      inv.membership_threshold,
  );

  const sampleCompanies = coerceSampleCompanies(
    item.sampleCompanies ??
      item.sample_companies ??
      inv.sampleCompanies ??
      inv.knownSponsorsVerified ??
      inv.sample_companies,
  );

  const filterHints =
    str(
      (item.extractionGuide as { filterHints?: unknown } | undefined)
        ?.filterHints,
    ) ||
    str(item.filterHints) ||
    str(source.filterHints);

  const listUrl =
    str(memberList?.url) ||
    str(item.listUrl) ||
    source.listUrl ||
    source.url;

  if (sampleCompanies?.length) {
    summary.push(
      `✓ Sample companies: ${sampleCompanies
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ")}`,
    );
  }

  const draft: ProbeOutput = {
    producer: "OmegaClaw",
    missionId,
    sourceId: source.id,
    sourceFields: fields,
    richness: computeRichness(fields),
    extractionGuide: {
      listPattern: listPattern as ProbeOutput["extractionGuide"]["listPattern"],
      fields: guideFields.filter((f) => fields.includes(f)),
      pagination: false,
      ...(filterHints ? { filterHints } : {}),
      notes: str(item.nuanceRuleApplied) || str(item.notes),
    },
    suggestedConfidence:
      num(item.suggestedConfidence) ?? num(source.suggestedConfidence) ?? 60,
    evidence: {
      checked_at: new Date().toISOString(),
      url: listUrl || source.url || str(item.url),
      membership_threshold: threshold ?? "unknown",
      summary_reasons: summary,
      domain_age: str(inv.domainAge),
      org_age: str(inv.orgAge),
      ...(sampleCompanies?.length
        ? { sample_companies: sampleCompanies }
        : {}),
    },
    ...(sampleCompanies?.length ? { sampleCompanies } : {}),
    ...(barrier ? { accessBarrier: barrier } : {}),
  };

  return ProbeOutputSchema.parse(draft);
}

function coerceSampleCompanies(
  raw: unknown,
): Array<{ name: string; note?: string }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: Array<{ name: string; note?: string }> = [];
  for (const row of raw) {
    if (typeof row === "string" && row.trim()) {
      out.push({ name: row.trim() });
      continue;
    }
    if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      const name = str(o.name);
      if (!name) continue;
      const note =
        str(o.note) ||
        str(o.tier) ||
        str(o.duration) ||
        str(o.source) ||
        undefined;
      out.push(note ? { name, note } : { name });
    }
  }
  return out.length ? out.slice(0, 5) : undefined;
}

/* ------------------------------ extract ---------------------------------- */

async function importExtract(
  store: Store,
  missionId: string,
  payload: unknown,
): Promise<ImportRouteResult> {
  const missionSources = await store.listByMission("sources", missionId);
  const accepted = missionSources.filter(
    (s) => s.status === "accepted" || s.status === "adjusted",
  );
  if (!accepted.length) {
    throw new ImportRouteError(
      "Extract import requires ≥1 CURAD-accepted/adjusted source on this mission",
    );
  }

  const existing = await store.listByMission("companies", missionId);
  const existingNames = new Set(
    existing.map((c) => c.name.trim().toLowerCase()),
  );

  const { companies: rawCompanies, warnings } = normalizeExtractPayload(
    payload,
    missionId,
    accepted,
  );

  const skipped: ImportRouteResult["skipped"] = [];
  const filtered: ExtractCompany[] = [];
  for (const c of rawCompanies) {
    const key = c.name.trim().toLowerCase();
    if (existingNames.has(key)) {
      skipped.push({ reason: `Already on mission: ${c.name}` });
      continue;
    }
    filtered.push(c);
  }

  const output = ExtractOutputSchema.parse({
    producer: "OmegaClaw",
    missionId,
    companies: filtered,
  }) satisfies ExtractOutput;

  const defaultSource = accepted[0];
  const drafts = buildExtractCompanyRecords(output, missionId, defaultSource);
  // Fix source linkage when companies named specific lists
  const companies: Company[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const raw = filtered[i];
    const linked = linkCompanySources(draft, raw, accepted);
    const saved = await store.upsert("companies", linked);
    existingNames.add(saved.name.trim().toLowerCase());
    companies.push(saved);
  }

  return {
    job: "extract",
    imported: companies.length,
    skipped,
    companies,
    warnings,
  };
}

function normalizeExtractPayload(
  payload: unknown,
  _missionId: string,
  accepted: Source[],
): { companies: ExtractCompany[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!payload || typeof payload !== "object") {
    throw new ImportRouteError("Extract payload must be a JSON object or array");
  }

  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.companies)) list = p.companies;
    else {
      throw new ImportRouteError(
        "Extract payload needs companies[] (frozen Job 3 or simple list)",
      );
    }
  }

  const byName = new Map(
    accepted.map((s) => [s.name.trim().toLowerCase(), s] as const),
  );
  const companies: ExtractCompany[] = [];

  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const name = str(c.name);
    if (!name) {
      warnings.push("Skipped company with no name");
      continue;
    }

    let sourceIds = Array.isArray(c.source_ids)
      ? (c.source_ids as string[]).filter((id) =>
          accepted.some((s) => s.id === id),
        )
      : [];

    if (!sourceIds.length && Array.isArray(c.list_membership)) {
      for (const label of c.list_membership as unknown[]) {
        const src = byName.get(String(label).trim().toLowerCase());
        if (src) sourceIds.push(src.id);
      }
    }
    if (!sourceIds.length) sourceIds = [accepted[0]!.id];

    const listMembership = Array.isArray(c.list_membership)
      ? (c.list_membership as unknown[]).map(String)
      : sourceIds
          .map((id) => accepted.find((s) => s.id === id)?.name)
          .filter((n): n is string => Boolean(n));

    companies.push({
      name,
      address: str(c.address),
      region: str(c.region),
      kvk_number: str(c.kvk_number),
      kvk_gate:
        c.kvk_gate === "pass" || c.kvk_gate === "fail" || c.kvk_gate === "unchecked"
          ? c.kvk_gate
          : str(c.kvk_number)
            ? "pass"
            : "unchecked",
      source_ids: sourceIds,
      list_membership: listMembership,
      fieldsExtracted: Array.isArray(c.fieldsExtracted)
        ? (c.fieldsExtracted as ExtractCompany["fieldsExtracted"])
        : (["name"] as SourceFieldKey[]),
      specialism: str(c.specialism),
      tier: str(c.tier),
      image: str(c.image),
    });
  }

  return { companies, warnings };
}

function linkCompanySources(
  draft: Company,
  raw: ExtractCompany | undefined,
  accepted: Source[],
): Company {
  if (!raw?.source_ids?.length) return draft;
  const valid = raw.source_ids.filter((id) =>
    accepted.some((s) => s.id === id),
  );
  if (!valid.length) return draft;
  return {
    ...draft,
    source_ids: valid,
    list_membership: raw.list_membership.length
      ? raw.list_membership
      : valid
          .map((id) => accepted.find((s) => s.id === id)?.name)
          .filter((n): n is string => Boolean(n)),
  };
}

/* ------------------------------ harvest ---------------------------------- */

async function importHarvest(
  store: Store,
  missionId: string,
  payload: unknown,
): Promise<ImportRouteResult> {
  const companies = await store.listByMission("companies", missionId);
  const items = unwrapHarvestItems(payload);
  const skipped: ImportRouteResult["skipped"] = [];
  const updatedList: Company[] = [];
  const warnings: string[] = [];

  for (const item of items) {
    const match = resolveCompany(companies, item);
    if (!match) {
      skipped.push({
        reason: "No matching company on mission",
        detail: str(item.companyId) || str(item.name) || "?",
      });
      continue;
    }
    try {
      const harvest = normalizeHarvestItem(item, missionId, match);
      const patch = buildHarvestCompanyPatch(harvest, {
        profileSourceUrl:
          str(item.profileSourceUrl) ||
          str(
            item.profile && typeof item.profile === "object"
              ? (item.profile as Record<string, unknown>).profileSourceUrl
              : undefined,
          ) ||
          match.website_url ||
          match.profileSourceUrl,
      });
      const updated = await store.upsert("companies", { ...match, ...patch });
      const idx = companies.findIndex((c) => c.id === match.id);
      if (idx >= 0) companies[idx] = updated;
      updatedList.push(updated);
    } catch (err) {
      skipped.push({
        reason: err instanceof Error ? err.message : "Harvest import failed",
        detail: match.name,
      });
    }
  }

  if (!items.length) {
    throw new ImportRouteError(
      "Harvest payload needs HarvestOutput, profile object, or an array",
    );
  }

  return {
    job: "harvest",
    imported: updatedList.length,
    skipped,
    companies: updatedList,
    warnings,
  };
}

function unwrapHarvestItems(payload: unknown): Record<string, unknown>[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter(
      (x): x is Record<string, unknown> =>
        Boolean(x) && typeof x === "object",
    );
  }
  if (typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.profiles)) {
    return p.profiles.filter(
      (x): x is Record<string, unknown> =>
        Boolean(x) && typeof x === "object",
    );
  }
  if (Array.isArray(p.companies)) {
    return p.companies.filter(
      (x): x is Record<string, unknown> =>
        Boolean(x) && typeof x === "object",
    );
  }
  return [p];
}

function resolveCompany(
  companies: Company[],
  item: Record<string, unknown>,
): Company | null {
  const id = str(item.companyId) || str(item.id);
  if (id) {
    const byId = companies.find((c) => c.id === id);
    if (byId) return byId;
  }
  const name = str(item.name);
  if (name) {
    const key = name.trim().toLowerCase();
    return companies.find((c) => c.name.trim().toLowerCase() === key) ?? null;
  }
  return null;
}

function normalizeHarvestItem(
  item: Record<string, unknown>,
  missionId: string,
  company: Company,
): HarvestOutput {
  const profile =
    item.profile && typeof item.profile === "object"
      ? (item.profile as Record<string, unknown>)
      : item;

  const draft = {
    producer: "OmegaClaw" as const,
    missionId,
    companyId: company.id,
    capabilities: Array.isArray(profile.capabilities)
      ? (profile.capabilities as string[])
      : Array.isArray(item.capabilities)
        ? (item.capabilities as string[])
        : [],
    serviceContexts: Array.isArray(profile.serviceContexts)
      ? profile.serviceContexts
      : Array.isArray(item.serviceContexts)
        ? item.serviceContexts
        : [],
    differentiators: Array.isArray(profile.differentiators)
      ? (profile.differentiators as string[])
      : Array.isArray(item.differentiators)
        ? (item.differentiators as string[])
        : [],
    profileSnippet:
      str(profile.profileSnippet) ||
      str(item.profileSnippet) ||
      `${company.name} — profile imported from Ω JSON.`,
    harvest_confidence:
      item.harvest_confidence === "high" ||
      item.harvest_confidence === "medium" ||
      item.harvest_confidence === "low"
        ? item.harvest_confidence
        : undefined,
  };

  return HarvestOutputSchema.parse(draft);
}

/* ------------------------------- helpers --------------------------------- */

function coerceAccessBarrier(raw: unknown): AccessBarrier | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const kindRaw = str(b.kind) || "unknown";
  const kind =
    (BARRIER_KINDS.has(kindRaw)
      ? (kindRaw as BarrierKind)
      : BARRIER_KIND_ALIASES[kindRaw]) ?? "unknown";
  const severity =
    b.severity === "partial" || b.severity === "soft"
      ? b.severity
      : "blocks-extract";

  return {
    id: str(b.id) && isUuid(str(b.id)!) ? str(b.id)! : uuid(),
    scope: b.scope === "company" ? "company" : "source",
    kind,
    severity,
    what_omega_needs:
      str(b.what_omega_needs) || "List data OmegaClaw cannot reach alone.",
    what_human_does:
      str(b.what_human_does) ||
      "Resolve the access barrier so extract can continue.",
    free_tier_available: Boolean(b.free_tier_available),
    status: "raised",
    raised_at: str(b.raised_at) || new Date().toISOString(),
  };
}

function asScope(v: unknown): SourceScope | null {
  const s = str(v);
  return s && SCOPES.has(s as SourceScope) ? (s as SourceScope) : null;
}

function asCategory(v: unknown): SourceCategory | null {
  const s = str(v);
  return s && CATEGORIES.has(s) ? (s as SourceCategory) : null;
}

function asType(v: unknown): SourceType | null {
  const s = str(v);
  return s && TYPES.has(s) ? (s as SourceType) : null;
}

function asThreshold(v: unknown): MembershipThreshold | undefined {
  const s = str(v);
  return s && THRESHOLDS.has(s) ? (s as MembershipThreshold) : undefined;
}

function asDepth(v: unknown): "shallow" | "list_ready" | undefined {
  const s = str(v);
  if (s === "shallow" || s === "list_ready") return s;
  return undefined;
}

function asListRenderType(
  v: unknown,
): "text" | "images" | "js-app" | "pdf" | undefined {
  const s = str(v);
  if (s === "text" || s === "images" || s === "js-app" || s === "pdf") return s;
  return undefined;
}

function asConfidence(
  v: unknown,
): "high" | "medium" | "low" | undefined {
  const s = str(v);
  if (s === "high" || s === "medium" || s === "low") return s;
  return undefined;
}

function inferType(category: SourceCategory): SourceType {
  if (category === "registry") return "registry";
  if (
    category === "branch_association" ||
    category === "local_business_association" ||
    category === "networking_group"
  ) {
    return "association";
  }
  if (category === "municipal_initiative") return "municipality";
  if (category === "local_media") return "news";
  return "directory";
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}
