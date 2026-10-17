import { waitUntil } from "@vercel/functions";

function apiBase(): string {
  const explicit = (process.env.H3_API_BASE ?? "").replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = (process.env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  const port = process.env.PORT ?? "8787";
  return `http://127.0.0.1:${port}`;
}

function keepAlive(task: Promise<unknown>): void {
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}

function postInternal(path: string, body: unknown, label: string): void {
  const token = (process.env.H3_WORKER_TOKEN ?? "").trim();
  if (token.length < 16) {
    console.error(`[${label}] H3_WORKER_TOKEN missing or shorter than 16 characters`);
    return;
  }
  const task = fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        console.error(`[${label}] step ${res.status}: ${text.slice(0, 300)}`);
      }
    })
    .catch((err) => {
      console.error(`[${label}] kick failed`, err instanceof Error ? err.message : err);
    });
  keepAlive(task);
}

/** Start the next shortlist slice. The step route returns before the slice finishes. */
export function scheduleHhhShortlistStep(jobId: string, lock?: string): void {
  postInternal("/api/internal/hhh-shortlist/step", { jobId, lock }, "hhh-shortlist");
}

export function scheduleLocalSourceGeocode(): void {
  postInternal("/api/internal/local-sources/geocode", {}, "local-sources");
}

export function deferHhhSlice(task: Promise<unknown>): void {
  keepAlive(task);
}
