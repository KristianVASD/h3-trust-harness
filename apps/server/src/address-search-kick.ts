import { waitUntil } from "@vercel/functions";

function stepUrl(): string {
  const explicit = (process.env.H3_API_BASE ?? "").replace(/\/$/, "");
  if (explicit) return `${explicit}/api/internal/address-search/step`;
  const vercel = (process.env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}/api/internal/address-search/step`;
  const port = process.env.PORT ?? "8787";
  return `http://127.0.0.1:${port}/api/internal/address-search/step`;
}

function keepAlive(task: Promise<unknown>): void {
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}

/** Start the next address-search slice. The step route returns before the slice finishes. */
export function scheduleAddressSearchStep(runId: string, lock?: string): void {
  const token = (process.env.H3_WORKER_TOKEN ?? "").trim();
  if (token.length < 16) {
    console.error("[address-search] H3_WORKER_TOKEN missing or shorter than 16 characters");
    return;
  }
  const task = fetch(stepUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ runId, lock }),
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      console.error(`[address-search] step ${res.status}: ${text.slice(0, 300)}`);
    }
  }).catch((err) => {
    console.error("[address-search] step kick failed", err instanceof Error ? err.message : err);
  });
  keepAlive(task);
}

export function deferAddressSlice(task: Promise<unknown>): void {
  keepAlive(task);
}
