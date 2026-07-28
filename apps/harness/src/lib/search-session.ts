const STORAGE_KEY = "h3_search_session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `h3-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Per-browser anonymous search quota id (localStorage — survives cookie-blocked WebViews). */
export function getSearchSessionId(): string {
  if (typeof window === "undefined") return newId();
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
    if (existing && (UUID_RE.test(existing) || existing.startsWith("h3-"))) {
      return existing;
    }
    const id = newId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return newId();
  }
}

export const SEARCH_SESSION_HEADER = "X-H3-Search-Session";
