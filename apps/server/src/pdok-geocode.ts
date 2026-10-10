export type GeoHit = {
  label: string;
  lat: number;
  lon: number;
  postcode4?: string;
  gemeente?: string;
  woonplaats?: string;
};

type PdokDoc = {
  weergavenaam?: string;
  centroide_ll?: string;
  postcode?: string;
  gemeentenaam?: string;
  woonplaatsnaam?: string;
};

const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

function parsePoint(value: string | undefined): { lat: number; lon: number } | null {
  const match = (value ?? "").match(/POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function fromDoc(doc: PdokDoc): GeoHit | null {
  const point = parsePoint(doc.centroide_ll);
  if (!point) return null;
  const postcode = (doc.postcode ?? "").replace(/\s+/g, "");
  return {
    label: doc.weergavenaam?.trim() || doc.woonplaatsnaam?.trim() || "",
    lat: point.lat,
    lon: point.lon,
    postcode4: postcode.slice(0, 4) || undefined,
    gemeente: doc.gemeentenaam?.trim() || undefined,
    woonplaats: doc.woonplaatsnaam?.trim() || undefined,
  };
}

async function search(q: string, fq: string): Promise<GeoHit | null> {
  const url = new URL(PDOK);
  url.searchParams.set("q", q);
  url.searchParams.set("rows", "1");
  if (fq) url.searchParams.set("fq", fq);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { response?: { docs?: PdokDoc[] } };
  const doc = body.response?.docs?.[0];
  return doc ? fromDoc(doc) : null;
}

/** Official PDOK Locatieserver. Address first, then a place name. */
export async function geocodeNl(query: string, kind: "adres" | "woonplaats" = "adres"): Promise<GeoHit | null> {
  const q = query.trim();
  if (!q) return null;
  if (kind === "woonplaats") {
    return (await search(q, "type:woonplaats")) ?? (await search(q, ""));
  }
  return (await search(q, "type:adres")) ?? (await search(q, "type:woonplaats")) ?? (await search(q, ""));
}
