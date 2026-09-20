import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const RETENTION_MS = 24 * 30 * 24 * 60 * 60 * 1000;

export type InterestType = "company" | "sector";

export type InterestRecord = {
  id: string;
  type: InterestType;
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

export function createInterestStore(writableRoot?: string) {
  const root =
    writableRoot?.trim() ||
    process.env.WRITABLE_ROOT?.trim() ||
    path.join(process.cwd(), "writable");

  async function save(record: InterestRecord): Promise<InterestRecord> {
    const dir = path.join(root, "interest");
    await mkdir(dir, { recursive: true });
    await pruneOldJson(dir);
    const file = path.join(dir, `${record.id}.json`);
    await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  return { save };
}
