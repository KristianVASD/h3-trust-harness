/**
 * OmegaClaw adapter seam — Phase 1 (+ Phase 3 discover → Source builders).
 *
 * Today: stub bodies return correctly-shaped data (no API key).
 * Phase 9: replace only the stub bodies inside `stubImpl`; contracts stay frozen.
 */
import { v4 as uuid } from "uuid";
import {
  assertGuideSubsetOfFields,
  computeRichness,
  SOURCE_FIELD_KEYS,
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

    const summaryReasons = [
      candidate.reason?.trim(),
      candidate.confidence_in_existence
        ? `? Existence confidence: ${candidate.confidence_in_existence}`
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
      url: candidate.url,
      reason: candidate.reason,
      suggestedWeight: candidate.suggestedWeight,
      suggestedConfidence: candidate.suggestedConfidence,
      signalIds: [],
      evidenceIds: [],
      evidence: {
        checked_at: now,
        url: candidate.url,
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
} {
  assertGuideSubsetOfFields(probe.extractionGuide.fields, probe.sourceFields);
  return {
    sourceFields: probe.sourceFields,
    richness: probe.richness,
    extractionGuide: probe.extractionGuide,
    probeStatus: "probed",
    suggestedConfidence: probe.suggestedConfidence,
    evidence: probe.evidence,
    producer: "OmegaClaw",
    updatedAt: nowIso(),
  };
}

/** Persistable company profile patch from a harvest result. */
export function buildHarvestCompanyPatch(harvest: HarvestOutput): {
  capabilities: string[];
  serviceContexts: HarvestOutput["serviceContexts"];
  differentiators: string[];
  profileSnippet: string;
  profileHarvestedAt: string;
  profileProducer: "OmegaClaw";
  updatedAt: string;
} {
  return {
    capabilities: harvest.capabilities,
    serviceContexts: harvest.serviceContexts,
    differentiators: harvest.differentiators,
    profileSnippet: harvest.profileSnippet,
    profileHarvestedAt: nowIso(),
    profileProducer: "OmegaClaw",
    updatedAt: nowIso(),
  };
}

/* ----------------------------- stub bodies ----------------------------- */

function stubDiscover(input: DiscoverInput): DiscoverOutput {
  const { gap, context, existingSourceNames } = input;
  const name = `Ω stub · ${gap.category} (${gap.layer}) · ${context.location}`;
  if (existingSourceNames.includes(name)) {
    return mirrorStamp({
      producer: "OmegaClaw",
      missionId: input.missionId,
      candidates: [
        {
          found: false,
          reason: "Stub: existing source names already cover this gap cell.",
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
        name,
        type: "association",
        category: gap.category,
        scope: gap.layer,
        region: gap.layer === "national" ? "" : context.location,
        url: `https://example.stub/${gap.category}`,
        reason: `Stub discover for ${gap.category} @ ${gap.layer}. ${gap.nuance_rule ?? ""}`.trim(),
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
  // Fallback if caller passed empty universe — still valid against SOURCE_FIELD_KEYS
  const sourceFields =
    fields.length > 0
      ? fields
      : (["name", "website", "address"] as SourceFieldKey[]);
  const extractionFields = sourceFields.slice();
  assertGuideSubsetOfFields(extractionFields, sourceFields);
  const richness = computeRichness(sourceFields);

  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    sourceId: input.sourceId,
    sourceFields,
    richness,
    extractionGuide: {
      listPattern: "directory",
      fields: extractionFields,
      pagination: true,
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
      ],
    },
  });
}

function stubExtract(input: ExtractInput): ExtractOutput {
  const companies = input.sources.flatMap((src, i) => {
    const guideFields = src.extractionGuide.fields;
    assertGuideSubsetOfFields(guideFields, src.sourceFields.length ? src.sourceFields : guideFields);
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
  return mirrorStamp({
    producer: "OmegaClaw",
    missionId: input.missionId,
    companyId: input.companyId,
    capabilities: ["interior painting", "exterior painting"],
    serviceContexts: [...allowed].slice(0, 2),
    differentiators: ["stub local presence", "colour advice"],
    profileSnippet: `Stub harvest for ${input.name}${input.website_url ? ` (${input.website_url})` : ""}. Residential painters in ${input.missionId.slice(0, 8)}.`,
    harvest_confidence: "medium",
    webpageTrustProbe: {
      domain_age: "unknown",
      has_real_address: true,
      has_contact: true,
      notes: "Placeholder webpage-check stub — signal only, not a gate.",
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
