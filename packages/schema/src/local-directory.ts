export const LOCAL_DIRECTORY_SECTOR = "Local Directory";
export const LOCAL_DIRECTORY_SUBSECTOR = "Unclassified";

/** Mixed lists: members are not a single trade. */
export const MIXED_SOURCE_CATEGORIES = [
  "local_business_association",
  "sponsorship",
  "networking_group",
  "municipal_initiative",
  "local_media",
] as const;

export function isMixedSourceCategory(category: string): boolean {
  return (MIXED_SOURCE_CATEGORIES as readonly string[]).includes(category);
}

export function isLocalDirectoryMission(mission: {
  sector: string;
  subsector: string;
}): boolean {
  return (
    mission.sector.trim().toLowerCase() === LOCAL_DIRECTORY_SECTOR.toLowerCase() &&
    mission.subsector.trim().toLowerCase() === LOCAL_DIRECTORY_SUBSECTOR.toLowerCase()
  );
}

export function defaultAudienceForCategory(
  category: string,
): "private" | "hoa" | "municipal" | "commercial" | undefined {
  if (category === "quality_mark" || category === "sector_qualification") {
    return "private";
  }
  if (category === "municipal_initiative") return "municipal";
  if (category === "branch_association") return undefined;
  return undefined;
}

export function defaultWeightForList(
  category: string,
  layer: "national" | "regional" | "local",
): number {
  if (category === "registry") return 90;
  if (category === "quality_mark" || category === "sector_qualification") return 75;
  if (category === "local_business_association") return 65;
  if (category === "sponsorship") return 40;
  if (layer === "national") return 70;
  if (layer === "local") return 65;
  return 55;
}
