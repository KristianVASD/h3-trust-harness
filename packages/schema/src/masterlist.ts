import { z } from "zod";
import rawMasterlist from "./masterlist.json";

/**
 * H3 / SEIN element masterlist — service-logic types (not SfB).
 * Intake maps free-text via aliases; unknown → needs_review (+ proposals).
 * Split rule: new type only if trade, obligation, or lifespan differs.
 */

export const ElementScopeSchema = z.enum(["C", "P"]);
export type ElementScope = z.infer<typeof ElementScopeSchema>;

export const PropertyContextSchema = z.enum([
  "house",
  "apartment_unit",
  "hoa_common",
  "commercial",
  "mixed_use",
  "terrain",
]);
export type PropertyContext = z.infer<typeof PropertyContextSchema>;

export const ResponsibilitySchema = z.enum([
  "private",
  "common",
  "mixed",
  "landlord",
  "na",
]);
export type Responsibility = z.infer<typeof ResponsibilitySchema>;

export const ObligationKindSchema = z.enum([
  "inspect",
  "maintain",
  "certify",
  "legal",
  "replace",
  "monitor",
  "none",
]);
export type ObligationKind = z.infer<typeof ObligationKindSchema>;

export const DefaultObligationSchema = z.object({
  kind: ObligationKindSchema,
  interval_months: z.number().int().positive().nullable(),
  note: z.string().nullable(),
});
export type DefaultObligation = z.infer<typeof DefaultObligationSchema>;

export const LifespanSchema = z
  .object({
    min: z.number(),
    max: z.number(),
  })
  .nullable();

export const MasterlistCategorySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  name_en: z.string().min(1),
  sort: z.number().int(),
});
export type MasterlistCategory = z.infer<typeof MasterlistCategorySchema>;

export const MasterlistTradeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type MasterlistTrade = z.infer<typeof MasterlistTradeSchema>;

export const MasterlistElementSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  name_en: z.string().min(1),
  aliases: z.array(z.string()),
  category: z.string().min(1),
  scope: z.array(ElementScopeSchema).min(1),
  property_contexts: z.array(PropertyContextSchema).min(1),
  responsibility: ResponsibilitySchema,
  trade: z.string().min(1),
  typical_lifespan_years: LifespanSchema,
  default_obligation: DefaultObligationSchema,
  sfb_tabel1: z.string().nullable(),
  status: z.enum(["active", "deprecated"]).default("active"),
});
export type MasterlistElement = z.infer<typeof MasterlistElementSchema>;

export const MasterlistDocumentSchema = z.object({
  version: z.string().min(1),
  id: z.string().min(1),
  locale: z.string().min(1),
  updated: z.string().min(1),
  description: z.string(),
  split_rule: z.string(),
  scopes: z.record(z.string(), z.object({ label: z.string(), ui: z.string() })),
  property_contexts: z.record(z.string(), z.string()),
  responsibility: z.record(z.string(), z.string()),
  obligation_kinds: z.record(z.string(), z.string()),
  categories: z.array(MasterlistCategorySchema),
  trades: z.array(MasterlistTradeSchema),
  elements: z.array(MasterlistElementSchema),
  alias_index_notes: z.string().optional(),
  growth_policy: z
    .object({
      intake_maps_only: z.boolean(),
      on_unknown: z.string(),
      propose_alias_or_type: z.boolean(),
      new_type_requires_split_rule: z.boolean(),
      versioning: z.string(),
    })
    .optional(),
  ui_filter: z
    .object({
      consumer: z.string(),
      pro: z.string(),
      hoa: z.string(),
      apartment_owner: z.string(),
    })
    .optional(),
});
export type MasterlistDocument = z.infer<typeof MasterlistDocumentSchema>;

/** Validated singleton — fail fast if JSON drifts from schema. */
export const MASTERLIST: MasterlistDocument =
  MasterlistDocumentSchema.parse(rawMasterlist);

export type UiAudience = "consumer" | "pro" | "hoa" | "apartment_owner";

/** Fold for alias matching: trim, lowercase, collapse whitespace. */
export function foldAlias(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export type AliasIndex = {
  /** folded key → element code(s). Multiple = ambiguous. */
  byAlias: Map<string, string[]>;
  byCode: Map<string, MasterlistElement>;
};

/** Build reverse alias index (code, name, name_en, aliases). */
export function buildAliasIndex(
  elements: readonly MasterlistElement[] = MASTERLIST.elements,
): AliasIndex {
  const byAlias = new Map<string, string[]>();
  const byCode = new Map<string, MasterlistElement>();

  function add(key: string, code: string) {
    const folded = foldAlias(key);
    if (!folded) return;
    const existing = byAlias.get(folded);
    if (!existing) {
      byAlias.set(folded, [code]);
      return;
    }
    if (!existing.includes(code)) existing.push(code);
  }

  for (const el of elements) {
    if (el.status !== "active") continue;
    byCode.set(el.code, el);
    add(el.code, el.code);
    add(el.name, el.code);
    add(el.name_en, el.code);
    for (const a of el.aliases) add(a, el.code);
  }

  return { byAlias, byCode };
}

const DEFAULT_INDEX = buildAliasIndex();

export type ElementResolveMatched = {
  status: "matched";
  input: string;
  code: string;
  element: MasterlistElement;
  via: "code" | "name" | "alias";
};

export type ElementResolveNeedsReview = {
  status: "needs_review";
  input: string;
  /** Ambiguous hits or nearest proposals (codes). */
  proposals: Array<{
    code: string;
    name: string;
    reason: "ambiguous" | "suggest_alias";
  }>;
};

export type ElementResolveResult =
  | ElementResolveMatched
  | ElementResolveNeedsReview;

/**
 * Map a raw intake string to an element code.
 * No inventing — match or needs_review (+ proposals when ambiguous).
 *
 * Match order: exact fold → unique whole-token alias hit (e.g. "Remeha Tzerra"
 * contains alias "Remeha" → CVK).
 */
export function resolveElementAlias(
  raw: string,
  index: AliasIndex = DEFAULT_INDEX,
): ElementResolveResult {
  const input = raw.trim();
  const folded = foldAlias(input);
  if (!folded) {
    return { status: "needs_review", input, proposals: [] };
  }

  const hits = index.byAlias.get(folded);
  if (hits && hits.length === 1) {
    const code = hits[0]!;
    const element = index.byCode.get(code)!;
    const via =
      foldAlias(element.code) === folded
        ? "code"
        : foldAlias(element.name) === folded ||
            foldAlias(element.name_en) === folded
          ? "name"
          : "alias";
    return { status: "matched", input, code, element, via };
  }

  if (hits && hits.length > 1) {
    return {
      status: "needs_review",
      input,
      proposals: hits.map((code) => {
        const el = index.byCode.get(code)!;
        return { code, name: el.name, reason: "ambiguous" as const };
      }),
    };
  }

  // Token / substring alias: "Remeha Tzerra" → Remeha → CVK
  const tokenCodes = new Set<string>();
  for (const [key, codes] of index.byAlias) {
    if (key.length < 3) continue;
    const asWord = new RegExp(
      `(^|[^a-z0-9])${escapeRegex(key)}([^a-z0-9]|$)`,
      "i",
    );
    if (!asWord.test(folded)) continue;
    for (const code of codes) tokenCodes.add(code);
  }
  if (tokenCodes.size === 1) {
    const code = [...tokenCodes][0]!;
    const element = index.byCode.get(code)!;
    return { status: "matched", input, code, element, via: "alias" };
  }
  if (tokenCodes.size > 1) {
    return {
      status: "needs_review",
      input,
      proposals: [...tokenCodes].map((code) => {
        const el = index.byCode.get(code)!;
        return { code, name: el.name, reason: "ambiguous" as const };
      }),
    };
  }

  // Soft proposals: substring containment in alias keys (intake growth cue).
  const proposals: ElementResolveNeedsReview["proposals"] = [];
  if (folded.length >= 4) {
    for (const [key, codes] of index.byAlias) {
      if (key.includes(folded) || folded.includes(key)) {
        for (const code of codes) {
          if (proposals.some((p) => p.code === code)) continue;
          const el = index.byCode.get(code);
          if (!el) continue;
          proposals.push({
            code,
            name: el.name,
            reason: "suggest_alias",
          });
          if (proposals.length >= 5) break;
        }
      }
      if (proposals.length >= 5) break;
    }
  }

  return { status: "needs_review", input, proposals };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Batch resolve; preserves input order. */
export function resolveElementAliases(
  terms: readonly string[],
  index: AliasIndex = DEFAULT_INDEX,
): ElementResolveResult[] {
  return terms.map((t) => resolveElementAlias(t, index));
}

/**
 * Collect unique matched element codes from free-text terms
 * (capabilities, specialism, pasted intake lines, …).
 */
export function collectMatchedElementCodes(
  terms: readonly string[],
  index: AliasIndex = DEFAULT_INDEX,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const r = resolveElementAlias(term, index);
    if (r.status !== "matched") continue;
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    out.push(r.code);
  }
  return out;
}

export function getElementByCode(
  code: string,
  index: AliasIndex = DEFAULT_INDEX,
): MasterlistElement | undefined {
  return index.byCode.get(code) ?? index.byCode.get(code.toUpperCase());
}

export function filterElementsForUi(
  audience: UiAudience,
  elements: readonly MasterlistElement[] = MASTERLIST.elements,
): MasterlistElement[] {
  const active = elements.filter((e) => e.status === "active");
  switch (audience) {
    case "consumer":
      return active.filter((e) => e.scope.includes("C"));
    case "pro":
      return [...active];
    case "hoa":
      return active.filter(
        (e) =>
          e.property_contexts.includes("hoa_common") ||
          e.responsibility === "common" ||
          e.responsibility === "mixed",
      );
    case "apartment_owner":
      return active.filter(
        (e) =>
          e.property_contexts.includes("apartment_unit") ||
          e.property_contexts.includes("house"),
      );
    default:
      return [...active];
  }
}

export function listActiveElements(
  elements: readonly MasterlistElement[] = MASTERLIST.elements,
): MasterlistElement[] {
  return elements.filter((e) => e.status === "active");
}

/** Flat alias table suitable for Ω prompts (code → aliases including name). */
export function masterlistAliasTableForPrompt(
  elements: readonly MasterlistElement[] = MASTERLIST.elements,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const el of elements) {
    if (el.status !== "active") continue;
    out[el.code] = [el.name, el.name_en, ...el.aliases];
  }
  return out;
}
