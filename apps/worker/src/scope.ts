/** Local/regional community channels — skipped on national sector harvest. */
export const COMMUNITY_CATEGORIES = new Set([
  "local_business_association",
  "sponsorship",
  "networking_group",
  "municipal_initiative",
  "trade_fair",
]);

export const SECTOR_CATEGORIES = new Set([
  "registry",
  "branch_association",
  "quality_mark",
  "sector_qualification",
  "labor_market_presence",
  "internship_market",
  "digital_presence",
]);

export function isCommunityCategory(category: string): boolean {
  return COMMUNITY_CATEGORIES.has(category);
}

export function allowLocalCommunity(input: Record<string, unknown>): boolean {
  return input.allowLocalCommunity === true || input.scope === "place_test";
}
