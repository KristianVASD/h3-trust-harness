/**
 * OmegaClaw adapter seam — Phase 1 (+ Phase 3 discover → Source builders).
 * Phase 6: access-barrier gating on extract + human fulfillment helpers.
 *
 * Today: stub bodies return correctly-shaped data (no API key).
 * Phase 9: replace only the stub bodies inside `stubImpl`; contracts stay frozen.
 */
import { v4 as uuid } from "uuid";
import {
  assertGuideSubsetOfFields,
  computeRichness,
  isBlockingBarrier,
  SOURCE_FIELD_KEYS,
  type AccessBarrier,
  type BarrierFulfillment,
  type Company,
  type Source,
  type SourceFieldKey,
} from "@h3-trust/schema";
import {
  OMEGA_CONTRACTS,
  type DiscoverCandidate,
  type DiscoverInput,
  type DiscoverOutput,
  type ExtractInput,
  type ExtractOutput,
  type HarvestInput,
  type HarvestOutput,
  type OmegaCommand,
  type ProbeInput,
  type ProbeOutput,
  type RefreshInput,
  type RefreshOutput,
} from "@h3-trust/schema/omega";

export type OcCommandInput = {
  discover: DiscoverInput;
  probe: ProbeInput;
  extract: ExtractInput;
  harvest: HarvestInput;
  refresh: RefreshInput;
};

export type OcCommandOutput = {
  discover: DiscoverOutput;
  probe: ProbeOutput;
  extract: ExtractOutput;
  harvest: HarvestOutput;
  refresh: RefreshOutput;
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Mirror stamp — every Ω return is producer-tagged at the contract layer. */
export function mirrorStamp<T extends { producer: "OmegaClaw" }>(output: T): T {
  return { ...output, producer: "OmegaClaw" };
}

/** Not-found discover candidates — surfaced to the UI, not persisted. */
export type DiscoverSkipped = {
  reason: string;
  candidate: DiscoverCandidate;
};

/**
 * Persistable Source drafts from a discover result.
 * Only `found: true` + named candidates become rows; skipped list is for the UI.
 */
export function buildDiscoverSourceRecords(
  output: DiscoverOutput,
  missionId: string,
): { sources: Source[]; skipped: DiscoverSkipped[] } {
  const now = nowIso();
  const sources: Source[] = [];
  const skipped: DiscoverSkipped[] = [];

  for (const candidate of output.candidates) {
    if (!candidate.found || !candidate.name?.trim()) {
      skipped.push({
        reason:
          candidate.reason?.trim() ||
          "OmegaClaw reported no findable source for this gap.",
        candidate,
      });
      continue;
    }

    const listUrl = candidate.listUrl?.trim() || undefined;
    const homepage = candidate.url?.trim() || undefined;
    // Prefer the list/search surface as primary url when provided.
    const primaryUrl = listUrl || homepage;
    const depth =
      candidate.depth ??
      (listUrl || candidate.filterHints || candidate.memberListPublic
        ? "list_ready"
        : homepage
          ? "shallow"
          : undefined);

    const summaryReasons = [
      candidate.reason?.trim(),
      candidate.confidence_in_existence
        ? `? Existence confidence: ${candidate.confidence_in_existence}`
        : null,
      depth === "shallow"
        ? "? Depth shallow — authority/brand page; hop to list surface before extract"
        : depth === "list_ready"
          ? "✓ Depth list_ready — company list/search surface reported"
          : null,
      candidate.discoveredVia
        ? `? Discovered via: ${candidate.discoveredVia}`
        : null,
      candidate.filterHints
        ? `? Filter hints: ${candidate.filterHints}`
        : null,
    ].filter((r): r is string => Boolean(r));

    sources.push({
      id: uuid(),
      producer: "OmegaClaw",
      createdAt: now,
      updatedAt: now,
      v: 1,
      first_seen_mission: missionId,
      reused_in_missions: [],
      name: candidate.name.trim(),
      type: candidate.type ?? "directory",
      category: candidate.category ?? "digital_presence",
      scope: candidate.scope ?? "regional",
      region: candidate.region ?? "",
      url: primaryUrl,
      listUrl,
      discoveredVia: candidate.discoveredVia,
      listRenderType: candidate.listRenderType,
      filterHints: candidate.filterHints,
      depth,
      memberListPublic: candidate.memberListPublic,
      reason: candidate.reason,
      suggestedWeight: candidate.suggestedWeight,
      suggestedConfidence: candidate.suggestedConfidence,
      signalIds: [],
      evidenceIds: [],
      evidence: {
        checked_at: now,
        url: primaryUrl,
        summary_reasons: summaryReasons.length
          ? summaryReasons
          : ["Ω provisional candidate — awaiting probe"],
      },
      status: "candidate",
      notes: "Provisional Ω proposal — probe before CURAD align.",
      sourceFields: [],
      probeStatus: "unprobed",
    });
  }

  return { sources, skipped };
}

/**
 * Persistable Source patch from a probe result.
 * Caller merges onto the existing Source row.
 *
 * accessBarrier rule: when probe returns a barrier, set it; when absent, omit
 * from the patch so a previously fulfilled barrier is not casually wiped.
 */
export function buildProbeSourcePatch(probe: ProbeOutput): {
  sourceFields: SourceFieldKey[];
  richness: ProbeOutput["richness"];
  extractionGuide: ProbeOutput["extractionGuide"];
  probeStatus: "probed";
  suggestedConfidence?: number;
  evidence: ProbeOutput["evidence"];
  producer: "OmegaClaw";
  updatedAt: string;
  accessBarrier?: AccessBarrier;
  depth?: "list_ready" | "shallow";
} {
  assertGuideSubsetOfFields(probe.extractionGuide.fields, probe.sourceFields);

  const samples =
    probe.sampleCompanies ?? probe.evidence.sample_companies ?? undefined;
  const evidence = {
    ...probe.evidence,
    ...(samples?.length ? { sample_companies: samples } : {}),
  };

  const hasSamples = (evidence.sample_companies?.length ?? 0) > 0;
  const blocked =
    probe.accessBarrier != null && isBlockingBarrier(probe.accessBarrier);
  const depth: "list_ready" | "shallow" | undefined = hasSamples
    ? "list_ready"
    : blocked
      ? undefined
      : "shallow";

  return {
    sourceFields: probe.sourceFields,
    richness: probe.richness,
    extractionGuide: probe.extractionGuide,
    probeStatus: "probed",
    suggestedConfidence: probe.suggestedConfidence,
    evidence,
    producer: "OmegaClaw",
    updatedAt: nowIso(),
    ...(probe.accessBarrier ? { accessBarrier: probe.accessBarrier } : {}),
    ...(depth ? { depth } : {}),
  };
}

/** Persistable company profile patch from a harvest result. */
export function buildHarvestCompanyPatch(
  harvest: HarvestOutput,
  opts?: { profileSourceUrl?: string },
): {
  capabilities: string[];
  serviceContexts: HarvestOutput["serviceContexts"];
  differentiators: string[];
  profileSnippet: string;
  profileSourceUrl?: string;
  profileHarvestedAt: string;
  profileProducer: "OmegaClaw";
  updatedAt: string;
} {
  return {
    capabilities: harvest.capabilities,
    serviceContexts: harvest.serviceContexts,
    differentiators: harvest.differentiators,
    profileSnippet: harvest.profileSnippet,
    ...(opts?.profileSourceUrl
      ? { profileSourceUrl: opts.profileSourceUrl }
      : {}),
    profileHarvestedAt: nowIso(),
    profileProducer: "OmegaClaw",
    updatedAt: nowIso(),
  };
}

export type BlockedSourceRef = {
  sourceId: string;
  barrierId: string;
  kind: string;
  what_human_does: string;
};

/**
 * EXTRACT with barrier gating. Blocked sources never reach the scraper —
 * that is the anti-bypass. Pass mission Sources so the gate can read
 * accessBarrier without a store dependency (smoke-friendly).
 */
export async function runExtractGated(
  input: ExtractInput,
  missionSources: Source[],
): Promise<ExtractOutput & { blocked: BlockedSourceRef[] }> {
  const byId = new Map(missionSources.map((s) => [s.id, s]));

  const unlocked: ExtractInput["sources"] = [];
  const blocked: BlockedSourceRef[] = [];

  for (const ref of input.sources) {
    const src = byId.get(ref.id);
    const barrier = src?.accessBarrier;
    if (barrier && isBlockingBarrier(barrier)) {
      blocked.push({
        sourceId: ref.id,
        barrierId: barrier.id,
        kind: barrier.kind,
        what_human_does: barrier.what_human_does,
      });
      continue;
    }
    unlocked.push(ref);
  }

  const output = unlocked.length
    ? await runOcCommand("extract", { ...input, sources: unlocked })
    : mirrorStamp({
        producer: "OmegaClaw" as const,
        missionId: input.missionId,
        companies: [],
        discoveryNotes: "all sources blocked by barriers",
      });

  return { ...output, blocked };
}

/** Secrets-store seam — Phase 6 stub stores nothing (ref only, never the secret). */
export async function storeSecretRef(_ref: string): Promise<void> {
  /* no-op */
}

/** Mark barrier fulfilled; does not persist. */
export function buildFulfilledBarrier(
  barrier: AccessBarrier,
  fulfillment: BarrierFulfillment,
): AccessBarrier {
  return {
    ...barrier,
    status: "human-fulfilled",
    fulfilled_at: nowIso(),
    fulfillment,
  };
}

/** Mark barrier declined with a mandatory reason note. */
export function buildDeclinedBarrier(
  barrier: AccessBarrier,
  reason: string,
  by: string,
): AccessBarrier {
  return {
    ...barrier,
    status: "human-declined",
    fulfilled_at: nowIso(),
    fulfillment: {
      kind: "note",
      note: reason,
      by,
    },
  };
}

/**
 * Human-produced company drafts from a barrier fulfillment's manual-rows.
 * Dual-labelled: producer = Human.
 */
export function buildHumanCompaniesFromFulfillment(args: {
  missionId: string;
  source: Source;
  fulfillment: BarrierFulfillment;
}): Company[] {
  if (
    args.fulfillment.kind !== "manual-rows" ||
    !args.fulfillment.manual_companies?.length
  ) {
    return [];
  }
  const now = nowIso();
  const src = args.source;
  return args.fulfillment.manual_companies.map((m) => ({
    id: uuid(),
    missionId: args.missionId,
    producer: "Human" as const,
    createdAt: now,
    updatedAt: now,
    v: 1,
    name: m.name,
    address: m.address ?? "",
    region: src.region || "",
    sector: src.category,
    category: src.category,
    kvk_number: m.kvk_number,
    kvk_gate: (m.kvk_number ? "pass" : "unchecked") as "pass" | "unchecked",
    source_ids: [src.id],
    list_membership: [src.name],
    specialism: m.specialism,
    blacklist_flags: [],
    status: "candidate" as const,
    capabilities: [],
    serviceContexts: [],
    differentiators: [],
  }));
}

/** Persistable Company drafts from an Ω extract result. */
export function buildExtractCompanyRecords(
  output: ExtractOutput,
  missionId: string,
  source?: Source,
): Company[] {
  const now = nowIso();
  return output.companies.map((c) => ({
    id: uuid(),
    missionId,
    producer: "OmegaClaw" as const,
    createdAt: now,
    updatedAt: now,
    v: 1,
    name: c.name,
    address: c.address ?? "",
    region: c.region ?? "",
    sector: source?.category ?? "",
    category: source?.category ?? "",
    kvk_number: c.kvk_number,
    kvk_gate: c.kvk_gate,
    source_ids: c.source_ids.length
      ? c.source_ids
      : source
        ? [source.id]
        : [],
    list_membership: c.list_membership.length
      ? c.list_membership
      : source
        ? [source.name]
        : [],
    specialism: c.specialism,
    blacklist_flags: [],
    status: "candidate" as const,
    capabilities: [],
    serviceContexts: [],
    differentiators: [],
  }));
}

function looksLikeKvkSource(input: ProbeInput): boolean {
  const url = (input.url ?? "").toLowerCase();
  return url.includes("kvk") || input.category === "registry";
}

function stubKvkBarrier(): AccessBarrier {
  return {
    id: uuid(),
    scope: "source",
    kind: "manual-lookup",
    severity: "blocks-extract",
    free_tier_available: true,
    estimated_effort: "minutes",
    what_omega_needs:
      "I cannot bulk-pull the KvK register — only verify one number at a time, and the free single-lookup needs a key I don't have.",
    what_human_does:
      "Apply for the free KvK single-lookup key and paste the ref, OR paste company names you already know and I'll verify each.",
    status: "raised",
    raised_at: nowIso(),
  };
}

function stubDiscover(input: DiscoverInput): DiscoverOutput {
  const { gap, context, existingSourceNames } = input;
  const stubName = `Ω Stub ${gap.category} · ${gap.layer}`;
  if (
    existingSourceNames.some((n) => n.toLowerCase() === stubName.toLowerCase())
  ) {
    return mirrorStamp({
      producer: "OmegaClaw",
      missionId: input.missionId,
      candidates: [
        {
          found: false,
          reason: `Already have a stub for ${gap.category} @ ${gap.layer}`,
        },
      ],
    });
  }
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    candidates: [
      {
        found: true,
        name: stubName,
        type: "association",
        category: gap.category,
        scope: gap.layer,
        region: gap.layer === "national" ? "" : context.location,
        url: `https://example.stub/${gap.category}`,
        reason:
          `Stub discover for ${gap.category} @ ${gap.layer}. ${gap.nuance_rule ?? ""}`.trim(),
        suggestedWeight: 55,
        suggestedConfidence: 60,
        confidence_in_existence: "medium",
      },
    ],
  });
}

function stubProbe(input: ProbeInput): ProbeOutput {
  const fields: SourceFieldKey[] = [
    "name",
    "website",
    "address",
    "phone",
    "kvk",
  ].filter((f) =>
    input.fieldUniverse.includes(f as SourceFieldKey),
  ) as SourceFieldKey[];
  const sourceFields =
    fields.length > 0
      ? fields
      : (["name", "website", "address"] as SourceFieldKey[]);
  const extractionFields = sourceFields.slice();
  assertGuideSubsetOfFields(extractionFields, sourceFields);
  const richness = computeRichness(sourceFields);
  const raiseBarrier = looksLikeKvkSource(input);

  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    sourceId: input.sourceId,
    sourceFields,
    richness,
    extractionGuide: {
      listPattern: raiseBarrier ? "search-form" : "directory",
      fields: extractionFields,
      pagination: !raiseBarrier,
      regionFilter: input.context.location,
      notes: `Stub probe against ${input.url ?? "(no url)"} · category ${input.category}`,
    },
    suggestedConfidence: Math.min(95, richness.score + 10),
    evidence: {
      checked_at: nowIso(),
      url: input.url,
      summary_reasons: [
        "✓ Stub probe — shape inferred without live fetch",
        `? Richness ${richness.score} (${richness.present.join("+")})`,
        ...(raiseBarrier
          ? ["⚠ Access barrier raised — human must unlock before extract"]
          : []),
      ],
    },
    ...(raiseBarrier ? { accessBarrier: stubKvkBarrier() } : {}),
  });
}

function stubExtract(input: ExtractInput): ExtractOutput {
  const companies = input.sources.flatMap((src, i) => {
    const guideFields = src.extractionGuide.fields;
    assertGuideSubsetOfFields(
      guideFields,
      src.sourceFields.length ? src.sourceFields : guideFields,
    );
    const baseName = `Ω Stub Co ${i + 1} · ${input.context.location}`;
    if (input.existingCompanyNames.includes(baseName)) return [];
    const hasKvk = guideFields.includes("kvk");
    return [
      {
        name: baseName,
        address: `${100 + i} Stubstraat, ${input.context.location}`,
        region: input.context.location,
        kvk_number: hasKvk ? `1234567${i}` : undefined,
        kvk_gate: (hasKvk ? "pass" : "unchecked") as "pass" | "unchecked",
        source_ids: [src.id],
        list_membership: [src.id],
        fieldsExtracted: guideFields,
        specialism: guideFields.includes("specialism")
          ? "interior painting"
          : undefined,
        tier: guideFields.includes("tier") ? "silver" : undefined,
      },
    ];
  });

  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    companies,
    discoveryNotes: "Stub extract — used extractionGuide.fields only.",
  });
}

function stubHarvest(input: HarvestInput): HarvestOutput {
  const allowed =
    input.service_contexts_allowed.length > 0
      ? input.service_contexts_allowed
      : (["private", "hoa"] as const);
  const hasUrl = Boolean(input.website_url?.trim());

  // No website → minimal name-only profile, low confidence — not an error.
  if (!hasUrl) {
    return mirrorStamp({
      producer: "OmegaClaw",
      missionId: input.missionId,
      companyId: input.companyId,
      capabilities: [],
      serviceContexts: [],
      differentiators: [],
      profileSnippet: `${input.name} — no website on file; profile is name-only.`,
      harvest_confidence: "low",
      webpageTrustProbe: {
        notes: "v2: traditional webpage trust probe not wired",
      },
    });
  }

  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    companyId: input.companyId,
    capabilities: ["interior painting", "exterior painting"],
    serviceContexts: [...allowed].slice(0, 2),
    differentiators: ["stub local presence", "colour advice"],
    profileSnippet: `Stub harvest for ${input.name} (${input.website_url}). Residential painters in ${input.missionId.slice(0, 8)}.`,
    harvest_confidence: "medium",
    webpageTrustProbe: {
      notes: "v2: traditional webpage trust probe not wired",
    },
  });
}

function stubRefresh(input: RefreshInput): RefreshOutput {
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    checked_at: nowIso(),
    companies_added: [],
    companies_removed: [],
    source_changes: [],
    overall_status: "no_changes",
  });
}

const stubImpl: {
  [K in OmegaCommand]: (input: OcCommandInput[K]) => OcCommandOutput[K];
} = {
  discover: stubDiscover,
  probe: stubProbe,
  extract: stubExtract,
  harvest: stubHarvest,
  refresh: stubRefresh,
};

/**
 * Validate input → run stub (or later live) body → validate output → Mirror.
 * Phase 9 swaps only `stubImpl` bodies; this seam stays.
 */
export async function runOcCommand<K extends OmegaCommand>(
  command: K,
  rawInput: OcCommandInput[K],
): Promise<OcCommandOutput[K]> {
  const contract = OMEGA_CONTRACTS[command];
  const input = contract.input.parse(rawInput) as OcCommandInput[K];
  const rawOut = stubImpl[command](input);

  if (command === "probe") {
    const probe = rawOut as ProbeOutput;
    assertGuideSubsetOfFields(probe.extractionGuide.fields, probe.sourceFields);
  }

  if (command === "extract") {
    const extract = rawOut as ExtractOutput;
    const inputExtract = input as ExtractInput;
    const allowed = new Set(
      inputExtract.sources.flatMap((s) => s.extractionGuide.fields),
    );
    for (const co of extract.companies) {
      const extra = co.fieldsExtracted.filter((f) => !allowed.has(f));
      if (extra.length > 0) {
        throw new Error(
          `extract fieldsExtracted not ⊆ guide fields: ${extra.join(", ")}`,
        );
      }
    }
  }

  const output = contract.output.parse(rawOut) as OcCommandOutput[K];
  return mirrorStamp(output as OcCommandOutput[K] & { producer: "OmegaClaw" });
}

/** Closed field universe for probe calls — pass this so Ω reports against YOUR list. */
export { SOURCE_FIELD_KEYS };
