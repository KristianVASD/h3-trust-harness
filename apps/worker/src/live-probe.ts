import type { Mission, Source, SourceFieldKey } from "@h3-trust/schema";
import { fetchPage } from "./fetch-page.js";
import { isPlaagdierList } from "./extractors/plaagdier.js";
import { loadPrompt } from "./load-prompt.js";
import { completeJson, DEFAULT_OPENROUTER_MODEL, parseJsonObject } from "./openrouter.js";
import { isJunkCompanyName } from "./source-guards.js";

const FIELD_KEYS: SourceFieldKey[] = [
  "name",
  "website",
  "address",
  "phone",
  "email",
  "image",
  "kvk",
  "specialism",
  "tier",
];

export async function liveProbe(args: {
  mission: Mission;
  source: Source;
  model?: string;
}): Promise<Record<string, unknown>> {
  const url = args.source.listUrl || args.source.url || "";
  const page = url ? await fetchPage(url) : null;
  const heuristic = analyzeStructure(page?.html ?? "", url, args.source);

  if ((process.env.OPENROUTER_API_KEY ?? "").trim() && page?.ok) {
    try {
      const raw = await completeJson({
        model: args.model || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
        system: loadPrompt("probe"),
        user: JSON.stringify(
          {
            source: {
              id: args.source.id,
              name: args.source.name,
              url: args.source.url,
              listUrl: args.source.listUrl,
              category: args.source.category,
            },
            mission: {
              country: args.mission.country,
              location: args.mission.location,
              subsector: args.mission.subsector,
            },
            heuristic,
            page: {
              status: page.status,
              finalUrl: page.url,
              text: page.text.slice(0, 8000),
            },
          },
          null,
          2,
        ),
      });
      const modelOut = parseJsonObject(raw);
      return mergeProbe(args.source, heuristic, modelOut, page.url);
    } catch {
      /* fall through to heuristic */
    }
  }

  return heuristicToProbe(args.source, heuristic, page?.url ?? url);
}

type Structure = {
  listPattern: string;
  listRenderType: string;
  pagination: boolean;
  fields: SourceFieldKey[];
  samples: string[];
  notes: string[];
  barrier?: {
    kind: string;
    severity: string;
    what_omega_needs: string;
    what_human_does: string;
  };
  extractor?: string;
};

function analyzeStructure(html: string, url: string, source: Source): Structure {
  const notes: string[] = [];
  const fields: SourceFieldKey[] = ["name"];
  if (/mailto:/i.test(html) || /@[a-z0-9.-]+\.[a-z]{2,}/i.test(html)) fields.push("email");
  if (/tel:/i.test(html) || /0[1-9][\d\s-]{7,}/.test(html)) fields.push("phone");
  if (/https?:\/\/|www\./i.test(html)) fields.push("website");
  if (/\bkvk\b|\bkamer van koophandel\b/i.test(html)) fields.push("kvk");
  if (/adres|straat|postcode|\d{4}\s?[A-Z]{2}/i.test(html)) fields.push("address");

  if (/login|wachtwoord|inloggen|sign in/i.test(html) && /password|wachtwoord/i.test(html)) {
    return {
      listPattern: "unknown",
      listRenderType: "text",
      pagination: false,
      fields,
      samples: [],
      notes: ["Login wall detected"],
      barrier: {
        kind: "login-wall",
        severity: "blocks-extract",
        what_omega_needs: "Public member list or credentials",
        what_human_does: "Log in and paste the member CSV, or decline",
      },
    };
  }
  if (/captcha|hcaptcha|recaptcha/i.test(html)) {
    return {
      listPattern: "unknown",
      listRenderType: "text",
      pagination: false,
      fields,
      samples: [],
      notes: ["Captcha detected"],
      barrier: {
        kind: "captcha",
        severity: "blocks-extract",
        what_omega_needs: "Unblocked list HTML",
        what_human_does: "Solve captcha and paste rows",
      },
    };
  }

  if (isPlaagdierList(html, url) || source.category === "branch_association" && /plaagdier/i.test(url)) {
    notes.push("Named extractor: plaagdier map-js markers + detail tel/mailto");
    return {
      listPattern: "map",
      listRenderType: "js-app",
      pagination: false,
      fields: ["name", "website", "phone", "email", "address", "specialism"],
      samples: [],
      notes,
      extractor: "plaagdier-map-js",
    };
  }

  const pagination = /[?&]page=|rel=["']next["']|volgende pagina|pagination/i.test(html);
  let listPattern = "unknown";
  if (/<table/i.test(html) && /<tr/i.test(html)) listPattern = "table";
  else if (/grid-item|member-card|card|ledenlijst/i.test(html)) listPattern = "cards";
  else if (/zoeken|search-form|<form/i.test(html)) listPattern = "search-form";
  else if (/directory|leden/i.test(html)) listPattern = "directory";

  if (/kvk\.nl|handelsregister/i.test(url) || source.category === "registry") {
    return {
      listPattern: "search-form",
      listRenderType: "text",
      pagination: false,
      fields: ["name", "kvk", "address"],
      samples: [],
      notes: ["Registry search form — bulk extract blocked"],
      barrier: {
        kind: "manual-lookup",
        severity: "blocks-extract",
        what_omega_needs: "Bulk list for this trade × place",
        what_human_does: "Use single lookup or paste a CSV export",
      },
    };
  }

  const samples = guessSampleNames(html);
  return {
    listPattern,
    listRenderType: /do_\w+\(|__NEXT_DATA__|ng-app/i.test(html) ? "js-app" : "text",
    pagination,
    fields: uniqueFields(fields),
    samples,
    notes,
  };
}

function guessSampleNames(html: string): string[] {
  const bold = [...html.matchAll(/<(?:h[1-3]|strong|b)[^>]*>([^<]{3,80})<\/(?:h[1-3]|strong|b)>/gi)]
    .map((m) => (m[1] ?? "").replace(/\s+/g, " ").trim())
    .filter(
      (n) =>
        /[A-Za-z]/.test(n) &&
        !isJunkCompanyName(n) &&
        !/leden|contact|zoek|specialisatie/i.test(n),
    );
  return [...new Set(bold)].slice(0, 3);
}

function uniqueFields(fields: SourceFieldKey[]): SourceFieldKey[] {
  return FIELD_KEYS.filter((f) => fields.includes(f));
}

function heuristicToProbe(
  source: Source,
  h: Structure,
  url: string,
): Record<string, unknown> {
  const samples = h.samples.map((name) => ({ name }));
  return {
    probes: [
      {
        sourceId: source.id,
        name: source.name,
        url: source.url ?? url,
        listUrl: source.listUrl ?? url,
        suggestedConfidence: h.barrier ? 55 : samples.length ? 80 : 65,
        sourceFields: h.fields,
        extractionGuide: {
          listPattern: h.listPattern,
          fields: h.fields,
          pagination: h.pagination,
          notes: [...h.notes, h.extractor ? `extractor=${h.extractor}` : ""]
            .filter(Boolean)
            .join(" · "),
        },
        evidence: {
          url,
          membership_threshold: "unknown",
          summary_reasons: h.notes.map((n) => `? ${n}`),
          sample_companies: samples,
        },
        sampleCompanies: samples,
        accessBarrier: h.barrier ?? null,
      },
    ],
  };
}

function mergeProbe(
  source: Source,
  h: Structure,
  model: Record<string, unknown>,
  url: string,
): Record<string, unknown> {
  const base = heuristicToProbe(source, h, url);
  const probes = Array.isArray(model.probes) ? model.probes : [model];
  const first =
    probes[0] && typeof probes[0] === "object"
      ? (probes[0] as Record<string, unknown>)
      : {};
  const baseProbe = (base.probes as Record<string, unknown>[])[0] ?? {};
  const merged: Record<string, unknown> = {
    ...baseProbe,
    ...first,
    sourceId: source.id,
    name: source.name,
    accessBarrier: h.barrier ?? first.accessBarrier ?? null,
  };
  if (h.extractor && merged.extractionGuide && typeof merged.extractionGuide === "object") {
    const guide = merged.extractionGuide as Record<string, unknown>;
    guide.notes = `${String(guide.notes ?? "")} extractor=${h.extractor}`.trim();
  }
  return { probes: [merged] };
}
