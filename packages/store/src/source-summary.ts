function isIdentityTool(args: {
  category?: string | null;
  listPattern?: string | null;
}): boolean {
  return args.category === "registry" || args.listPattern === "search-form";
}

export type SourceMissionSummary = {
  sourceCount: number;
  trustedCount: number;
  trustListCount: number;
  identityToolCount: number;
  nationalSourceCount: number;
  localSourceCount: number;
  trustListNames: string[];
};

export type SourceLiteRow = {
  name?: string;
  category?: string;
  scope?: string;
  status?: string;
  listPattern?: string;
};

export function emptySourceSummary(): SourceMissionSummary {
  return {
    sourceCount: 0,
    trustedCount: 0,
    trustListCount: 0,
    identityToolCount: 0,
    nationalSourceCount: 0,
    localSourceCount: 0,
    trustListNames: [],
  };
}

export function summarizeSourceLiteRows(
  rows: SourceLiteRow[],
): SourceMissionSummary {
  const acc = emptySourceSummary();
  for (const row of rows) {
    if (row.status === "rejected") continue;
    acc.sourceCount += 1;
    if (row.status === "accepted" || row.status === "adjusted") {
      acc.trustedCount += 1;
    }
    if (isIdentityTool({ category: row.category, listPattern: row.listPattern })) {
      acc.identityToolCount += 1;
    } else {
      acc.trustListCount += 1;
      const name = (row.name ?? "").trim();
      if (name && acc.trustListNames.length < 12) acc.trustListNames.push(name);
    }
    if (row.scope === "national") acc.nationalSourceCount += 1;
    else if (row.scope === "local" || row.scope === "regional") {
      acc.localSourceCount += 1;
    }
  }
  return acc;
}

export function liteRowFromUnknown(raw: unknown): SourceLiteRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const guide =
    o.extractionGuide && typeof o.extractionGuide === "object"
      ? (o.extractionGuide as Record<string, unknown>)
      : null;
  const name = String(o.name ?? o["payload->name"] ?? "").trim();
  const category = String(o.category ?? o["payload->category"] ?? "").trim();
  const scope = String(o.scope ?? o["payload->scope"] ?? "").trim();
  const status = String(o.status ?? o["payload->status"] ?? "").trim();
  const listPattern = String(
    o.listPattern ??
      o.list_pattern ??
      guide?.listPattern ??
      o["payload->extractionGuide->listPattern"] ??
      "",
  ).trim();
  return {
    name: name || undefined,
    category: category || undefined,
    scope: scope || undefined,
    status: status || undefined,
    listPattern: listPattern || undefined,
  };
}
