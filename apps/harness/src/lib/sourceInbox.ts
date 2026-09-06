import {
  isBlockingBarrier,
  isIdentityTool,
  type Source,
} from "@h3-trust/schema";

export function sourceIsIdentityTool(source: {
  category?: string;
  extractionGuide?: { listPattern?: string } | null;
  listPattern?: string;
  identityTool?: boolean;
}): boolean {
  if (source.identityTool === true) return true;
  return isIdentityTool({
    category: source.category,
    listPattern: source.listPattern ?? source.extractionGuide?.listPattern,
  });
}

export function inboxSortSources<T extends Source>(sources: T[]): T[] {
  return [...sources].sort((a, b) => {
    const score = (s: Source) => {
      let n = 0;
      if (s.probeStatus === "probed") n += 4;
      if (s.depth === "list_ready") n += 2;
      if (s.memberListPublic) n += 1;
      return n;
    };
    return score(b) - score(a);
  });
}

export type SourceInboxAction = {
  kind: "extract" | "paste" | "probe";
  label: string;
  href: string;
};

export function sourceInboxAction(
  source: Source,
  missionId: string,
): SourceInboxAction {
  const blocked =
    source.accessBarrier != null && isBlockingBarrier(source.accessBarrier);
  if (blocked) {
    const raw = (source.accessBarrier?.what_human_does ?? "").trim();
    const label = raw && raw.length <= 36 ? raw : "Paste CSV";
    return {
      kind: "paste",
      label,
      href: `/work/${missionId}/extract?sourceId=${source.id}&intent=csv#csv`,
    };
  }
  if (source.probeStatus !== "probed") {
    return {
      kind: "probe",
      label: "Probe",
      href: `/work/${missionId}/probe?sourceId=${source.id}`,
    };
  }
  return {
    kind: "extract",
    label: "Extract now",
    href: `/work/${missionId}/extract?sourceId=${source.id}`,
  };
}
