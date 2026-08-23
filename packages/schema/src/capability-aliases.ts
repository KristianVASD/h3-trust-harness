import { z } from "zod";

/**
 * Editable synonym table for free-text capabilities.
 * Lives next to searchplans/ as JSON; this module validates + normalizes.
 *
 * Canonical form is the map key; aliases are alternate spellings that
 * collapse to that key. No NLP — just a growing lookup table.
 */
export const CapabilityAliasesSchema = z.object({
  version: z.string().min(1),
  /** canonical → list of synonyms (case-insensitive match). */
  aliases: z.record(z.string(), z.array(z.string())),
  /**
   * Canonical Can key → HHH door id. Parents are defined on trades.v1.json
   * specialisations; this map must not invent a 13th door.
   */
  parentTrade: z.record(z.string(), z.string()).optional(),
});
export type CapabilityAliases = z.infer<typeof CapabilityAliasesSchema>;

function fold(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Map a raw capability string to its canonical form using an aliases table.
 * Unknown terms pass through trimmed (folded whitespace only).
 */
export function normalizeCapability(
  raw: string,
  aliasesMap: CapabilityAliases["aliases"] | Record<string, string[]>,
): string {
  const folded = fold(raw);
  if (!folded) return "";

  for (const [canonical, synonyms] of Object.entries(aliasesMap)) {
    if (fold(canonical) === folded) return canonical;
    for (const syn of synonyms) {
      if (fold(syn) === folded) return canonical;
    }
  }
  return folded;
}

/** Normalize a list; drops empties and dedupes by canonical form. */
export function normalizeCapabilities(
  raw: readonly string[],
  aliasesMap: CapabilityAliases["aliases"] | Record<string, string[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of raw) {
    const n = normalizeCapability(term, aliasesMap);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
