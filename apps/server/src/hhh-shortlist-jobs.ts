import type { SupabaseClient } from "@supabase/supabase-js";
import type { HhhPublicShortlist } from "@h3-trust/schema";

export type PartnerJobStatus = "queued" | "running" | "ready" | "failed";

export type PartnerJob = {
  id: string;
  request_id: string;
  status: PartnerJobStatus;
  payload: Record<string, unknown>;
  public_result: HhhPublicShortlist | null;
};

function asJob(row: Record<string, unknown>): PartnerJob {
  const status = row.status;
  const allowed: PartnerJobStatus[] = ["queued", "running", "ready", "failed"];
  return {
    id: String(row.id),
    request_id: String(row.request_id),
    status: allowed.includes(status as PartnerJobStatus) ? (status as PartnerJobStatus) : "failed",
    payload: (row.payload ?? {}) as Record<string, unknown>,
    public_result: (row.public_result ?? null) as HhhPublicShortlist | null,
  };
}

export async function findPartnerJobByRequest(
  admin: SupabaseClient,
  requestId: string,
): Promise<PartnerJob | null> {
  const { data, error } = await admin
    .from("partner_jobs")
    .select("id,request_id,status,payload,public_result")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asJob(data as Record<string, unknown>) : null;
}

export async function getPartnerJob(
  admin: SupabaseClient,
  id: string,
): Promise<PartnerJob | null> {
  const { data, error } = await admin
    .from("partner_jobs")
    .select("id,request_id,status,payload,public_result")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asJob(data as Record<string, unknown>) : null;
}

export async function insertPartnerJob(
  admin: SupabaseClient,
  row: { id: string; requestId: string; payload: Record<string, unknown> },
): Promise<PartnerJob> {
  const { data, error } = await admin
    .from("partner_jobs")
    .insert({
      id: row.id,
      request_id: row.requestId,
      status: "queued",
      payload: row.payload,
      public_result: null,
    })
    .select("id,request_id,status,payload,public_result")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not store the shortlist job");
  return asJob(data as Record<string, unknown>);
}

export async function savePartnerJob(
  admin: SupabaseClient,
  row: {
    id: string;
    status: PartnerJobStatus;
    payload: Record<string, unknown>;
    publicResult: HhhPublicShortlist | null;
  },
): Promise<void> {
  const { error } = await admin
    .from("partner_jobs")
    .update({
      status: row.status,
      payload: row.payload,
      public_result: row.publicResult,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}
