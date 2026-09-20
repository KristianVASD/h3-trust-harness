import {
  isCaraConfirmedSource,
  isLocalDirectoryMission,
  packMatchesTrade,
  primaryTradeId,
  publicPlaceLabel,
  tradeIdsForPackLabel,
  type Company,
  type Mission,
  type Source,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { countriesMatch, isNationalPack } from "./pack-match.js";

export type HhhLead = {
  name: string;
  address: string;
  region: string;
  specialty: string;
  tags: string[];
  audience: string[];
  website?: string;
  kvk_number?: string;
  kvk_gate: string;
  list_badges: string[];
  source_count: number;
  country_code: string;
};

function packMatchesExportFilter(mission: Mission, subsector?: string): boolean {
  const want = subsector?.trim();
  if (!want) return true;
  const wantIds = tradeIdsForPackLabel(want);
  const packIds = tradeIdsForPackLabel(mission.subsector);
  if (wantIds.length && packIds.length) {
    return wantIds.some((id) => packIds.includes(id));
  }
  return mission.subsector.trim().toLowerCase() === want.toLowerCase();
}

/**
 * Unclaimed-lead slice for HandyHouseHelp: company name + place + trade
 * when the firm sits on at least one CARA-accepted source.
 * No phone/email from association lists. No type ranking.
 */
export async function exportHhhHighTrustLeads(
  store: Store,
  args: { country?: string; subsector?: string },
): Promise<{ count: number; leads: HhhLead[] }> {
  const missions = await store.listMissions();
  const packs = missions.filter((m) => {
    if (!isNationalPack(m) || isLocalDirectoryMission(m)) return false;
    if (args.country && !countriesMatch(m, args.country)) return false;
    if (!packMatchesExportFilter(m, args.subsector)) return false;
    return true;
  });

  const leads: HhhLead[] = [];
  const seen = new Set<string>();

  for (const mission of packs) {
    const [companies, sources] = await Promise.all([
      store.listByMission("companies", mission.id) as Promise<Company[]>,
      store.listByMission("sources", mission.id) as Promise<Source[]>,
    ]);
    const acceptedIds = new Set(
      sources.filter((s) => isCaraConfirmedSource(s.status)).map((s) => s.id),
    );
    for (const company of companies) {
      if (company.status === "unknown") continue;
      const acceptedCount = (company.source_ids ?? []).filter((id) =>
        acceptedIds.has(id),
      ).length;
      if (acceptedCount < 1) continue;
      const key = `${(company.kvk_number ?? "").trim() || company.name.toLowerCase()}|${mission.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      leads.push(toLead(company, mission, acceptedCount, args.subsector));
    }
  }

  leads.sort((a, b) => b.source_count - a.source_count || a.name.localeCompare(b.name));
  return { count: leads.length, leads };
}

function toLead(
  company: Company,
  mission: Mission,
  acceptedCount: number,
  requestedSubsector?: string,
): HhhLead {
  const tags = [
    ...new Set(
      (company.capabilities ?? []).map((c) => c.trim()).filter(Boolean),
    ),
  ];
  const fromFilter = requestedSubsector
    ? primaryTradeId(requestedSubsector)
    : undefined;
  const fromPack = primaryTradeId(mission.subsector);
  const specialty =
    fromFilter && packMatchesTrade(mission.subsector, fromFilter)
      ? fromFilter
      : (fromPack ?? mission.subsector);
  const region = publicPlaceLabel(company.region, company.address);
  return {
    name: company.name,
    address: "",
    region,
    specialty,
    tags,
    audience: company.serviceContexts ?? [],
    website: company.website_url,
    kvk_number: company.kvk_number,
    kvk_gate: company.kvk_gate,
    list_badges: company.list_membership ?? [],
    source_count: acceptedCount,
    country_code: mission.country,
  };
}
