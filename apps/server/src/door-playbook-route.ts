import { randomUUID } from "node:crypto";
import {
  HOME_MAINTENANCE_SECTOR,
  SOURCE_CATEGORIES,
  coerceSectorPlaybook,
  primaryTradeId,
  sourceTypeForCategory,
  tradeLabel,
  type Source,
  type SourceCategory,
  type SourceScope,
} from "@h3-trust/schema";
import type { Store } from "@h3-trust/store";
import { PackOnboardError, ensureNationalPack } from "./pack-onboard-route.js";

export type DoorPlaybookResult = {
  missionId: string;
  createdMission: boolean;
  created: number;
  updated: number;
  skipped: number;
  total: number;
};

function playbookIncoming(body: unknown): unknown {
  const rec =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (typeof rec?.text === "string") return rec.text;
  if (Array.isArray(rec?.rows)) return rec.rows;
  return body;
}

export async function seedDoorPlaybook(
  store: Store,
  input: { country: string; tradeId: string; raw: unknown },
): Promise<DoorPlaybookResult> {
  const country = input.country.trim();
  const tradeId = primaryTradeId(input.tradeId) ?? input.tradeId.trim();
  if (!country || !tradeId) {
    throw new PackOnboardError("country and tradeId are required", 400);
  }

  const drafts = coerceSectorPlaybook(input.raw);
  if (!drafts.length) {
    throw new PackOnboardError(
      "No playbook rows matched the 12 discovery channels. Use channel + source_name columns.",
      400,
    );
  }

  const { mission, created: createdMission } = await ensureNationalPack(store, {
    country,
    sector: HOME_MAINTENANCE_SECTOR,
    subsector: tradeId,
    goal: `National ${tradeLabel(tradeId)} base layer for ${country}.`,
  });

  const existing = (await store.listByMission("sources", mission.id)) as Source[];
  const byName = new Map(
    existing.map((s) => [s.name.trim().toLowerCase(), s] as const),
  );
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const draft of drafts) {
    if (
      !SOURCE_CATEGORIES.includes(draft.category as (typeof SOURCE_CATEGORIES)[number])
    ) {
      skipped += 1;
      continue;
    }
    const key = draft.name.trim().toLowerCase();
    const current = byName.get(key);
    if (current) {
      if (current.status !== "candidate" && current.status !== "draft") {
        skipped += 1;
        continue;
      }
      const saved = (await store.upsert("sources", {
        ...current,
        suggestedWeight: draft.suggestedWeight ?? current.suggestedWeight,
        suggestedConfidence:
          draft.suggestedWeight ?? current.suggestedConfidence,
        filterHints: draft.filterHints || current.filterHints,
        reason: draft.reason || current.reason,
        notes: draft.notes || current.notes,
        url: draft.url || current.url,
        listUrl: draft.listUrl || current.listUrl,
        updatedAt: now,
      })) as Source;
      byName.set(key, saved);
      updated += 1;
      continue;
    }

    const saved = await store.createSourceInMission(mission.id, {
      id: randomUUID(),
      producer: "Human",
      createdAt: now,
      updatedAt: now,
      v: 1,
      first_seen_mission: mission.id,
      reused_in_missions: [],
      name: draft.name,
      type: sourceTypeForCategory(draft.category),
      category: draft.category as SourceCategory,
      scope: draft.layer as SourceScope,
      region: draft.layer === "national" ? "" : "",
      url: draft.url,
      listUrl: draft.listUrl,
      filterHints: draft.filterHints,
      reason: draft.reason,
      notes: draft.notes,
      suggestedWeight: draft.suggestedWeight,
      suggestedConfidence: draft.suggestedWeight,
      signalIds: [],
      evidenceIds: [],
      status: "candidate",
      sourceFields: [],
      probeStatus: "unprobed",
    });
    byName.set(key, saved);
    created += 1;
  }

  const types = [
    ...new Set(drafts.map((d) => d.category).filter(Boolean)),
  ];
  if (types.length) {
    await store.upsertMission({
      ...mission,
      discoveryBrief: {
        ...mission.discoveryBrief,
        candidateListTypes: types,
        updatedAt: now,
      },
      updatedAt: now,
    });
  }

  return {
    missionId: mission.id,
    createdMission,
    created,
    updated,
    skipped,
    total: drafts.length,
  };
}

export { playbookIncoming };
