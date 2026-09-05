import {
  DISCOVERY_CHANNELS,
  NationLandscapeSchema,
  countrySlug,
  displayCountry,
  emptyNationLandscape,
  mergeLandscapeChannels,
  type NationChannel,
  type NationLandscape,
} from "@h3-trust/schema";
import { h3 } from "./h3-api.js";
import { completeJson, DEFAULT_OPENROUTER_MODEL, parseJsonObject } from "./openrouter.js";
import { heartbeat, markStatus, writeEvent } from "./progress.js";
import type { WorkerRun } from "./types.js";

const COUNTRY_PLATFORMS: Record<
  string,
  Partial<Record<string, NationChannel["platforms"]>>
> = {
  netherlands: {
    "national|registry": [
      {
        name: "KVK Bedrijfsinformatie",
        url: "https://www.kvk.nl/zoeken/",
        unlockNote: "Use the searchable company lookup, not the KVK homepage. Record SBI filterHints.",
      },
    ],
    "national|labor_market_presence": [
      {
        name: "Stagemarkt / SBB",
        url: "https://www.stagemarkt.nl",
        unlockNote: "Prefer recognised-employer search over the SBB corporate site.",
      },
      {
        name: "Leerbanenmarkt",
        url: "https://www.leerbanenmarkt.nl",
        unlockNote: "Trade filter codes go in filterHints.",
      },
    ],
    "local|local_business_association": [
      {
        name: "Ondernemersvereniging / OV",
        unlockNote: "Prefer /leden or member-directory listUrl. Mixed list — badge all packs, leftovers to Local Directory.",
      },
    ],
    "local|sponsorship": [
      {
        name: "SponsorVisie",
        url: "https://www.sponsorvisie.nl",
        unlockNote: "Platform cascade: sponsor SaaS → club business club → /leden listUrl.",
      },
    ],
    "local|networking_group": [
      {
        name: "BNI Nederland",
        url: "https://bni.nl",
        unlockNote: "Public member roster only. Membership is social embedding, not craft skill.",
      },
    ],
    "local|trade_fair": [
      {
        name: "Jaarmarkt / kermis / braderie calendars",
        unlockNote: "Prefer exhibitor or sponsor lists for recurring yearly events. Record month in filterHints.",
      },
    ],
  },
};

function channelKey(layer: string, category: string): string {
  return `${layer}|${category}`;
}

function heuristicLandscape(country: string, existing: NationLandscape | null): NationLandscape {
  const base = mergeLandscapeChannels(existing ?? emptyNationLandscape(country));
  const slug = countrySlug(country);
  const extras = COUNTRY_PLATFORMS[slug] ?? {};
  const channels = base.channels.map((ch) => {
    const key = channelKey(ch.layer, ch.category);
    const platforms = ch.platforms.length ? ch.platforms : extras[key] ?? [];
    const howToFind =
      ch.howToFind.trim() ||
      [
        `How local proof is found in ${displayCountry(country)} for ${ch.title}.`,
        `Layer ${ch.layer}, category ${ch.category}.`,
        platforms.length
          ? `Start here: ${platforms.map((p) => p.name).join(", ")}.`
          : "Find the public member / exhibitor / employer listUrl, not the organisation homepage.",
        "This chapter is a search guide for later local overlay — CARA still locks trust weight.",
      ].join("\n\n");
    const coverage: NationChannel["coverage"] =
      ch.coverage !== "empty"
        ? ch.coverage
        : howToFind.trim() || platforms.length
          ? "proposed"
          : "empty";
    return { ...ch, platforms, howToFind, coverage };
  });
  const filled = channels.filter((c) => c.coverage !== "empty").length;
  return {
    ...base,
    country: displayCountry(country),
    countrySlug: slug,
    status: filled === DISCOVERY_CHANNELS.length ? "ready" : filled ? "mapping" : "empty",
    overview:
      base.overview.trim() ||
      `Trust landscape for ${displayCountry(country)}. Twelve discovery channels show how local proof can be found — traineeships, business clubs, sport-club platforms, yearly festivities — so sector searches know where to look. Playbook only; CARA locks sources.`,
    channels,
    producer: "OmegaClaw",
    updatedAt: new Date().toISOString(),
  };
}

export async function processNationMap(run: WorkerRun): Promise<void> {
  const country =
    (typeof run.input.country === "string" && run.input.country.trim()) ||
    (run.target_id ?? "").trim();
  if (!country) {
    await markStatus(run.id, "failed", {
      currentAction: "No country",
      error: "nation_map needs input.country or target_id",
      progressPct: 0,
    });
    return;
  }

  await heartbeat(run.id, `Loading landscape · ${displayCountry(country)}`, {
    phase: "context",
    step_index: 0,
    progress_pct: 5,
  });

  let existing: NationLandscape | null = null;
  try {
    existing = (await h3.getLandscape(country)).landscape;
  } catch {
    existing = null;
  }

  await writeEvent(run, {
    event_type: "context_loaded",
    message: `Mapping trust landscape for ${displayCountry(country)}`,
    data: { country, hadExisting: Boolean(existing) },
  });

  const model =
    typeof run.input.model === "string" ? run.input.model : DEFAULT_OPENROUTER_MODEL;
  let landscape = heuristicLandscape(country, existing);
  let via: "openrouter" | "heuristic" = "heuristic";

  try {
    await heartbeat(run.id, "Asking model for country playbook", {
      phase: "nation_map",
      step_index: 1,
      progress_pct: 20,
    });
    const raw = await completeJson({
      model,
      system:
        "You write nation trust-landscape playbooks for H3 Trust Harness. Return JSON only. CARA locks trust; you only explain HOW to find lists.",
      user: JSON.stringify({
        country: displayCountry(country),
        channels: DISCOVERY_CHANNELS.map((c) => ({
          layer: c.layer,
          category: c.category,
          title: c.title,
        })),
        instruction:
          "Fill overview (long) and every channel: howToFind (long, practical), platforms[{name,url,unlockNote}], proposedSources[{name,url,listUrl}]. Cover traineeships, local business clubs, sport-club unlock platforms, yearly festivities. coverage=proposed when you have a method.",
      }),
    });
    const parsed = parseJsonObject(raw);
    const merged = NationLandscapeSchema.safeParse({
      ...landscape,
      ...parsed,
      country: displayCountry(country),
      countrySlug: countrySlug(country),
      producer: "OmegaClaw",
      updatedAt: new Date().toISOString(),
      v: 1,
    });
    if (merged.success) {
      landscape = mergeLandscapeChannels(merged.data);
      via = "openrouter";
    }
  } catch (err) {
    await writeEvent(run, {
      event_type: "strategy_note",
      level: "warn",
      message: `Model map skipped: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const filled = landscape.channels.filter((c) => c.howToFind.trim()).length;
  landscape = {
    ...landscape,
    status: filled >= DISCOVERY_CHANNELS.length ? "ready" : "mapping",
    producer: "OmegaClaw",
    updatedAt: new Date().toISOString(),
  };

  await heartbeat(run.id, "Writing landscape document", {
    phase: "write",
    step_index: 11,
    progress_pct: 90,
  });

  const saved = await h3.putLandscape(country, landscape);

  await markStatus(run.id, "succeeded", {
    currentAction: "Landscape written",
    progressPct: 100,
    outputSummary: {
      country: saved.landscape.country,
      countrySlug: saved.landscape.countrySlug,
      channelsFilled: filled,
      via,
    },
  });
  await writeEvent(run, {
    event_type: "run_succeeded",
    level: "success",
    message: `Nation map ${via} · ${filled}/12 channels`,
    data: { via, channelsFilled: filled },
  });
}
