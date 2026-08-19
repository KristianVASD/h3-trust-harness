import {
  isLocalDirectoryMission,
  type Company,
  type Mission,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { countriesMatch, isNationalPack } from "./pack-match.js";

export type HhhLead = {
  name: string;
  address: string;
  region: string;
  specialties: string[];
  email?: string;
  phone?: string;
  website?: string;
  kvk_number?: string;
  kvk_gate: string;
  service_contexts: string[];
  list_badges: string[];
  source_count: number;
  country_code: string;
};

/**
 * Thin unclaimed-lead slice: sector-confirmed + on ≥2 independent lists.
 */
export async function exportHhhHighTrustLeads(
  store: Store,
  args: { country?: string; subsector?: string },
): Promise<{ count: number; leads: HhhLead[] }> {
  const missions = await store.listMissions();
  const packs = missions.filter((m) => {
    if (!isNationalPack(m) || isLocalDirectoryMission(m)) return false;
    if (args.country && !countriesMatch(m, args.country)) return false;
    if (
      args.subsector &&
      m.subsector.trim().toLowerCase() !== args.subsector.trim().toLowerCase()
    ) {
      return false;
    }
    return true;
  });

  const leads: HhhLead[] = [];
  const seen = new Set<string>();

  for (const mission of packs) {
    const companies = (await store.listByMission(
      "companies",
      mission.id,
    )) as Company[];
    for (const company of companies) {
      if (company.status === "unknown") continue;
      const sourceCount = new Set(company.source_ids ?? []).size;
      if (sourceCount < 2) continue;
      const key = `${(company.kvk_number ?? "").trim() || company.name.toLowerCase()}|${mission.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      leads.push(toLead(company, mission));
    }
  }

  leads.sort((a, b) => b.source_count - a.source_count || a.name.localeCompare(b.name));
  return { count: leads.length, leads };
}

function toLead(company: Company, mission: Mission): HhhLead {
  const specialties = [
    company.sector,
    ...(company.capabilities ?? []),
  ].filter(Boolean);
  return {
    name: company.name,
    address: company.address ?? "",
    region: company.region ?? "",
    specialties: [...new Set(specialties)],
    email: company.email,
    phone: company.phone,
    website: company.website_url,
    kvk_number: company.kvk_number,
    kvk_gate: company.kvk_gate,
    service_contexts: company.serviceContexts ?? [],
    list_badges: company.list_membership ?? [],
    source_count: new Set(company.source_ids ?? []).size,
    country_code: mission.country,
  };
}
