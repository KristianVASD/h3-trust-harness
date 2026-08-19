/** Places that count as local for each other (NL painter / Haarlemmermeer demos). */
export const PLACE_CLUSTERS: string[][] = [
  [
    "hoofddorp",
    "haarlemmermeer",
    "rijsenhout",
    "nieuw vennep",
    "badhoevedorp",
    "beinsdorp",
    "zwanenburg",
    "lisserbroek",
  ],
];

/** 4-digit NL postcode → canonical place in a known cluster. */
const POSTCODE4_TO_PLACE: Record<string, string> = {
  "2131": "hoofddorp",
  "2132": "hoofddorp",
  "2133": "hoofddorp",
  "2134": "hoofddorp",
  "2135": "hoofddorp",
  "2151": "nieuw vennep",
  "2152": "nieuw vennep",
  "2153": "nieuw vennep",
  "1171": "badhoevedorp",
  "1435": "rijsenhout",
  "1161": "zwanenburg",
  "2165": "lisserbroek",
  "2144": "beinsdorp",
  "2156": "haarlemmermeer",
  "2158": "haarlemmermeer",
};

export function normalizePlaceLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNlPostcode4(text: string | undefined): string | undefined {
  const match = (text ?? "").match(/\b(\d{4})\s*[A-Za-z]{2}\b/)
    ?? (text ?? "").match(/\b(\d{4})\b/);
  return match?.[1];
}

export function placeForPostcode4(postcode4: string | undefined): string | undefined {
  if (!postcode4) return undefined;
  return POSTCODE4_TO_PLACE[postcode4];
}

export function placeCluster(place: string): Set<string> {
  const n = normalizePlaceLabel(place);
  const set = new Set<string>(n ? [n] : []);
  for (const cluster of PLACE_CLUSTERS) {
    if (cluster.includes(n)) {
      for (const p of cluster) set.add(p);
    }
  }
  const fromPc = placeForPostcode4(n);
  if (fromPc) {
    set.add(fromPc);
    return placeCluster(fromPc);
  }
  return set;
}

/** True when company address/region is in the query place cluster (name or postcode). */
export function companyMatchesPlaceCluster(
  placeText: string,
  queryPlace: string,
): boolean {
  const hay = normalizePlaceLabel(placeText);
  const loc = queryPlace.trim();
  if (!loc || !hay) return false;
  const cluster = placeCluster(loc);
  for (const token of cluster) {
    if (token && (` ${hay} `.includes(` ${token} `) || hay === token)) {
      return true;
    }
  }
  const pc = extractNlPostcode4(placeText);
  const fromPc = placeForPostcode4(pc);
  if (fromPc && cluster.has(fromPc)) return true;
  return false;
}

export function countClusterHits(
  rows: Array<{ address?: string; region?: string }>,
  place: string,
): number {
  if (!place.trim()) return 0;
  return rows.filter((row) =>
    companyMatchesPlaceCluster(`${row.region ?? ""} ${row.address ?? ""}`, place),
  ).length;
}
