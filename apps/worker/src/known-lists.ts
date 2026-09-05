import type { Mission } from "@h3-trust/schema";

export type KnownList = {
  name: string;
  url: string;
  listUrl: string;
  category: string;
  scope: "national";
  filterHints?: string;
  motivation: string;
  depth: "list_ready" | "shallow";
  listRenderType: "text" | "js-app";
};

/** Verified public NL lists only — no invented URLs. */
const SHARED_LABOR: KnownList[] = [
  {
    name: "Stagemarkt / SBB erkende leerbedrijven",
    url: "https://stagemarkt.nl",
    listUrl: "https://stagemarkt.nl/bedrijven-register",
    category: "labor_market_presence",
    scope: "national",
    filterHints: "Filter on this trade's mbo qualification",
    motivation: "National recognised-employer board (SBB). Mixed-trade — do not force a door label.",
    depth: "shallow",
    listRenderType: "js-app",
  },
  {
    name: "Leerbanenmarkt",
    url: "https://www.leerbanenmarkt.nl",
    listUrl: "https://www.leerbanenmarkt.nl",
    category: "labor_market_presence",
    scope: "national",
    motivation: "National traineeship / leerbaan board. Mixed-trade.",
    depth: "shallow",
    listRenderType: "js-app",
  },
];

const BY_TRADE: Record<string, KnownList[]> = {
  roof: [
    {
      name: "VEBIDAK aangesloten dakbedekkingsbedrijven",
      url: "https://vebidak.nl",
      listUrl: "https://vebidak.nl/aangesloten-dakbedekkingsbedrijven/",
      category: "branch_association",
      scope: "national",
      motivation: "Public table of VEBIDAK member roofers (name, place, phone, site).",
      depth: "list_ready",
      listRenderType: "text",
    },
  ],
  pest: [
    {
      name: "PLA..N. ledenlijst plaagdierbeheersing",
      url: "https://platformplaagdierbeheersing.nl",
      listUrl: "https://platformplaagdierbeheersing.nl/index.mchil?page=ledenlijst&id=1008",
      category: "branch_association",
      scope: "national",
      motivation: "Public member map/list of the pest-control branche platform.",
      depth: "list_ready",
      listRenderType: "js-app",
    },
  ],
  electro: [
    {
      name: "De Echte Installateur (InstallQ)",
      url: "https://www.echteinstallateur.nl",
      listUrl: "https://echteinstallateur.nl/echte-installateur/vind-een-vakbekwame-installq-installateur",
      category: "quality_mark",
      scope: "national",
      filterHints: "Elektro & Zegelrecht",
      motivation: "InstallQ certified-installer finder. Postcode search — use local CSV mirror when present.",
      depth: "shallow",
      listRenderType: "js-app",
    },
  ],
  hvac: [
    {
      name: "De Echte Installateur (InstallQ)",
      url: "https://www.echteinstallateur.nl",
      listUrl: "https://echteinstallateur.nl/echte-installateur/vind-een-vakbekwame-installq-installateur",
      category: "quality_mark",
      scope: "national",
      filterHints: "CO Vrij & Verwarming; Luchtbehandeling",
      motivation: "InstallQ certified-installer finder. Mixed install trades.",
      depth: "shallow",
      listRenderType: "js-app",
    },
  ],
  bath: [
    {
      name: "De Echte Installateur (InstallQ)",
      url: "https://www.echteinstallateur.nl",
      listUrl: "https://echteinstallateur.nl/echte-installateur/vind-een-vakbekwame-installq-installateur",
      category: "quality_mark",
      scope: "national",
      filterHints: "Water & Legionellapreventie",
      motivation: "InstallQ certified-installer finder. Mixed install trades.",
      depth: "shallow",
      listRenderType: "js-app",
    },
  ],
  solar: [
    {
      name: "De Echte Installateur (InstallQ)",
      url: "https://www.echteinstallateur.nl",
      listUrl: "https://echteinstallateur.nl/echte-installateur/vind-een-vakbekwame-installq-installateur",
      category: "quality_mark",
      scope: "national",
      filterHints: "Zonnestroomsysteem (PV)",
      motivation: "InstallQ certified-installer finder. Mixed install trades.",
      depth: "shallow",
      listRenderType: "js-app",
    },
  ],
  drain: [
    {
      name: "De Echte Installateur (InstallQ)",
      url: "https://www.echteinstallateur.nl",
      listUrl: "https://echteinstallateur.nl/echte-installateur/vind-een-vakbekwame-installq-installateur",
      category: "quality_mark",
      scope: "national",
      filterHints: "Riool",
      motivation: "InstallQ certified-installer finder. Mixed install trades.",
      depth: "shallow",
      listRenderType: "js-app",
    },
  ],
};

export function knownListsFor(
  mission: Pick<Mission, "country" | "subsector">,
  gap: { layer: string; category: string },
): KnownList[] {
  if (!/nederland|netherlands/i.test(mission.country)) return [];
  if (gap.layer !== "national") return [];
  const trade = mission.subsector.trim().toLowerCase();
  const tradeLists = BY_TRADE[trade] ?? [];
  const shared = gap.category === "labor_market_presence" ? SHARED_LABOR : [];
  return [...tradeLists, ...shared].filter((row) => row.category === gap.category);
}

export function discoverPayloadFromKnown(
  gap: { layer: string; category: string },
  lists: KnownList[],
): Record<string, unknown> {
  if (!lists.length) {
    return {
      gaps: [
        {
          layer: gap.layer,
          category: gap.category,
          found: false,
          sources: [],
          motivation_not_found: "No verified catalog URL for this gap yet.",
        },
      ],
    };
  }
  return {
    gaps: [
      {
        layer: gap.layer,
        category: gap.category,
        found: true,
        sources: lists.map((row) => ({
          name: row.name,
          url: row.url,
          listUrl: row.listUrl,
          scope: row.scope,
          region: "",
          category: row.category,
          suggestedWeight: 80,
          suggestedConfidence: 90,
          memberListPublic: row.depth === "list_ready",
          membershipBarrier: "medium",
          motivation: row.motivation,
          discoveredVia: "worker-known-lists",
          filterHints: row.filterHints,
          depth: row.depth,
          listRenderType: row.listRenderType,
          accessBarrier:
            row.depth === "shallow"
              ? {
                  kind: "manual-lookup",
                  severity: "partial",
                  what_omega_needs: "A bulk member extract or CSV for this finder.",
                  what_human_does: "Use the local CSV mirror if we have one, or pace a search.",
                }
              : null,
        })),
      },
    ],
  };
}
