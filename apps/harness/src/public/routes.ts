import type { PageView } from "./types";

export const VIEW_PATH: Record<PageView, string> = {
  home: "/",
  "hoe-het-werkt": "/hoe-het-werkt",
  sectoren: "/sectoren",
  "lokale-netwerken": "/lokale-netwerken",
  "vakman-worden": "/join",
  handyhousehelp: "/handyhousehelp",
  "over-h3": "/over-h3",
  zoeken: "/zoeken",
};

export function viewFromPath(pathname: string): PageView {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const hit = (Object.entries(VIEW_PATH) as [PageView, string][]).find(
    ([, path]) => path === normalized,
  );
  return hit?.[0] ?? "home";
}
