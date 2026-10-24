import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./auth.js";

const RETENTION_MS = 24 * 30 * 24 * 60 * 60 * 1000;

export type InterestType = "company" | "sector";
export type InterestStatus = "pending" | "contacted" | "closed";

export type InterestRecord = {
  id: string;
  type: InterestType;
  status: InterestStatus;
  companyName?: string;
  organization?: string;
  contactName: string;
  email: string;
  trade?: string;
  street?: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
  address?: string;
  notes?: string;
  sourceHolderKind?: string;
  shareManagedCompanyData?: boolean;
  welcomeHhhLocally?: boolean;
  submittedAt: string;
};

type DbRow = {
  id: string;
  type: InterestType;
  status: InterestStatus;
  company_name: string | null;
  organization: string | null;
  contact_name: string;
  email: string;
  trade: string | null;
  street: string | null;
  house_number: string | null;
  postcode: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  source_holder_kind: string | null;
  share_managed_company_data: boolean;
  welcome_hhh_locally: boolean;
  submitted_at: string;
};

const memory: InterestRecord[] = [];

function toRecord(row: DbRow): InterestRecord {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    companyName: row.company_name ?? undefined,
    organization: row.organization ?? undefined,
    contactName: row.contact_name,
    email: row.email,
    trade: row.trade ?? undefined,
    street: row.street ?? undefined,
    houseNumber: row.house_number ?? undefined,
    postcode: row.postcode ?? undefined,
    city: row.city ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    sourceHolderKind: row.source_holder_kind ?? undefined,
    shareManagedCompanyData: row.share_managed_company_data,
    welcomeHhhLocally: row.welcome_hhh_locally,
    submittedAt: row.submitted_at,
  };
}

function toInsert(record: InterestRecord) {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    company_name: record.companyName ?? null,
    organization: record.organization ?? null,
    contact_name: record.contactName,
    email: record.email,
    trade: record.trade ?? null,
    street: record.street ?? null,
    house_number: record.houseNumber ?? null,
    postcode: record.postcode ?? null,
    city: record.city ?? null,
    address: record.address ?? null,
    notes: record.notes ?? null,
    source_holder_kind: record.sourceHolderKind ?? null,
    share_managed_company_data: Boolean(record.shareManagedCompanyData),
    welcome_hhh_locally: Boolean(record.welcomeHhhLocally),
    submitted_at: record.submittedAt,
  };
}

function remember(record: InterestRecord): InterestRecord {
  memory.unshift(record);
  if (memory.length > 500) memory.length = 500;
  return record;
}

async function pruneOldJson(dir: string): Promise<void> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - RETENTION_MS;
  await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const file = path.join(dir, name);
        try {
          const raw = await readFile(file, "utf8");
          const parsed = JSON.parse(raw) as { submittedAt?: string };
          const at = parsed.submittedAt ? Date.parse(parsed.submittedAt) : NaN;
          if (Number.isFinite(at) && at < cutoff) await unlink(file);
        } catch {
          /* leave file */
        }
      }),
  );
}

async function saveToFile(
  root: string,
  record: InterestRecord,
): Promise<InterestRecord> {
  const dir = path.join(root, "interest");
  await mkdir(dir, { recursive: true });
  await pruneOldJson(dir);
  const file = path.join(dir, `${record.id}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

async function listFromFile(root: string, limit: number): Promise<InterestRecord[]> {
  const dir = path.join(root, "interest");
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const rows: InterestRecord[] = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    try {
      const raw = await readFile(path.join(dir, name), "utf8");
      const parsed = JSON.parse(raw) as InterestRecord;
      if (!parsed.status) parsed.status = "pending";
      rows.push(parsed);
    } catch {
      /* skip */
    }
  }
  return rows
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, limit);
}

async function saveToSupabase(
  admin: SupabaseClient,
  record: InterestRecord,
): Promise<InterestRecord | null> {
  const { data, error } = await admin
    .from("interest_applications")
    .insert(toInsert(record))
    .select("*")
    .single();
  if (!error && data) return toRecord(data as DbRow);
  console.error("[interest_applications] insert failed", error?.message);
  return null;
}

async function listFromSupabase(
  admin: SupabaseClient,
  limit: number,
): Promise<InterestRecord[] | null> {
  const { data, error } = await admin
    .from("interest_applications")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (!error && data) return (data as DbRow[]).map(toRecord);
  console.error("[interest_applications] list failed", error?.message);
  return null;
}

async function updateStatusInSupabase(
  admin: SupabaseClient,
  id: string,
  status: InterestStatus,
): Promise<InterestRecord | null> {
  const { data, error } = await admin
    .from("interest_applications")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (!error && data) return toRecord(data as DbRow);
  console.error("[interest_applications] update failed", error?.message);
  return null;
}

export function createInterestStore(writableRoot?: string) {
  const root =
    writableRoot?.trim() ||
    process.env.WRITABLE_ROOT?.trim() ||
    path.join(process.cwd(), "writable");

  async function save(
    input: Omit<InterestRecord, "status"> & { status?: InterestStatus },
  ): Promise<InterestRecord> {
    const record: InterestRecord = {
      ...input,
      status: input.status ?? "pending",
    };
    const admin = createSupabaseAdmin();
    if (admin) {
      const saved = await saveToSupabase(admin, record);
      if (saved) return saved;
    }

    try {
      return await saveToFile(root, record);
    } catch (err) {
      console.error("[interest] file save failed, using memory", err);
      return remember(record);
    }
  }

  async function list(limit = 100): Promise<InterestRecord[]> {
    const capped = Math.min(Math.max(limit, 1), 500);
    const admin = createSupabaseAdmin();
    if (admin) {
      const rows = await listFromSupabase(admin, capped);
      if (rows) return rows;
    }
    try {
      const files = await listFromFile(root, capped);
      if (files.length > 0) return files;
    } catch {
      /* fall through */
    }
    return memory.slice(0, capped);
  }

  async function setStatus(
    id: string,
    status: InterestStatus,
  ): Promise<InterestRecord | null> {
    const admin = createSupabaseAdmin();
    if (admin) {
      const updated = await updateStatusInSupabase(admin, id, status);
      if (updated) return updated;
    }
    const idx = memory.findIndex((row) => row.id === id);
    if (idx >= 0) {
      memory[idx] = { ...memory[idx], status };
      return memory[idx];
    }
    try {
      const file = path.join(root, "interest", `${id}.json`);
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as InterestRecord;
      const next = { ...parsed, status };
      await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      return next;
    } catch {
      return null;
    }
  }

  return { save, list, setStatus };
}
