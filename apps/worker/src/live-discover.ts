import type { Mission, Source } from "@h3-trust/schema";
import { fetchPage } from "./fetch-page.js";
import { loadPrompt } from "./load-prompt.js";
import { completeJson, DEFAULT_OPENROUTER_MODEL, parseJsonObject } from "./openrouter.js";
import { isCommunityCategory } from "./scope.js";

export async function liveDiscover(args: {
  mission: Mission;
  gap: { layer: string; category: string; nuance_rule?: string };
  sources: Source[];
  model?: string;
  allowLocalCommunity: boolean;
}): Promise<{ payload: Record<string, unknown>; verified: number }> {
  if (!args.allowLocalCommunity && isCommunityCategory(args.gap.category)) {
    return {
      payload: {
        gaps: [
          {
            layer: args.gap.layer,
            category: args.gap.category,
            found: false,
            sources: [],
            motivation_not_found:
              "National sector harvest skips regional/local community channels.",
          },
        ],
      },
      verified: 0,
    };
  }

  if (!(process.env.OPENROUTER_API_KEY ?? "").trim()) {
    return {
      payload: {
        gaps: [
          {
            layer: args.gap.layer,
            category: args.gap.category,
            found: false,
            sources: [],
            motivation_not_found:
              "OPENROUTER_API_KEY unset — cannot discover live sources.",
          },
        ],
      },
      verified: 0,
    };
  }

  const system = loadPrompt("discover");
  const user = JSON.stringify(
    {
      mission: {
        country: args.mission.country,
        location: args.mission.location,
        sector: args.mission.sector,
        subsector: args.mission.subsector,
        goal: args.mission.goal,
      },
      scope: args.allowLocalCommunity ? "place_test" : "national_sector",
      open_gaps: [args.gap],
      existing_sources: args.sources.map((s) => ({
        name: s.name,
        url: s.url,
        listUrl: s.listUrl,
        category: s.category,
        scope: s.scope,
      })),
    },
    null,
    2,
  );

  const raw = await completeJson({
    model: args.model || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    system,
    user,
  });
  const parsed = sanitizeDiscoverEnums(parseJsonObject(raw));
  const verified = await verifyListUrls(parsed);
  return { payload: verified, verified: countFound(verified) };
}

const RENDER_TYPES = new Set(["text", "images", "js-app", "pdf"]);

function coerceRenderType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim().toLowerCase();
  if (RENDER_TYPES.has(s)) return s;
  if (["search", "search-form", "directory", "table", "html"].includes(s)) return "text";
  if (["map", "js", "javascript", "spa", "app"].includes(s)) return "js-app";
  if (["image", "img", "logo"].includes(s)) return "images";
  return undefined;
}

function sanitizeDiscoverEnums(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const visit = (src: Record<string, unknown>) => {
    const next = coerceRenderType(src.listRenderType);
    if (next) src.listRenderType = next;
    else delete src.listRenderType;
  };
  for (const key of ["candidates", "discovered_sources"] as const) {
    const list = payload[key];
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row && typeof row === "object") visit(row as Record<string, unknown>);
    }
  }
  const gaps = Array.isArray(payload.gaps) ? payload.gaps : [];
  for (const gap of gaps) {
    if (!gap || typeof gap !== "object") continue;
    const sources = (gap as { sources?: unknown[] }).sources;
    if (!Array.isArray(sources)) continue;
    for (const src of sources) {
      if (src && typeof src === "object") visit(src as Record<string, unknown>);
    }
  }
  return payload;
}

async function verifyListUrls(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const gaps = Array.isArray(payload.gaps) ? payload.gaps : [];
  for (const gap of gaps) {
    if (!gap || typeof gap !== "object") continue;
    const g = gap as Record<string, unknown>;
    const sources = Array.isArray(g.sources) ? g.sources : [];
    const kept: unknown[] = [];
    for (const src of sources) {
      if (!src || typeof src !== "object") continue;
      const s = src as Record<string, unknown>;
      const listUrl =
        (typeof s.listUrl === "string" && s.listUrl) ||
        (typeof s.url === "string" && s.url) ||
        "";
      if (!/^https?:\/\//i.test(listUrl)) {
        continue;
      }
      const page = await fetchPage(listUrl);
      if (!page.ok) {
        s.depth = "shallow";
        s.memberListPublic = false;
        s.motivation = `${String(s.motivation ?? "")} URL check failed (${page.status}).`.trim();
      } else {
        s.listUrl = page.url;
        s.depth = s.depth ?? "list_ready";
      }
      kept.push(s);
    }
    g.sources = kept;
    if (!kept.length) {
      g.found = false;
      g.motivation_not_found =
        typeof g.motivation_not_found === "string"
          ? g.motivation_not_found
          : "No live listUrl verified.";
    } else {
      g.found = true;
    }
  }
  return { ...payload, gaps };
}

function countFound(payload: Record<string, unknown>): number {
  const gaps = Array.isArray(payload.gaps) ? payload.gaps : [];
  let n = 0;
  for (const gap of gaps) {
    if (!gap || typeof gap !== "object") continue;
    const sources = (gap as { sources?: unknown[] }).sources;
    if (Array.isArray(sources)) n += sources.length;
  }
  return n;
}
