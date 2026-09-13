import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
  submittedAt: string;
};

export function createInterestStore(writableRoot?: string) {
  const root =
    writableRoot?.trim() ||
    process.env.WRITABLE_ROOT?.trim() ||
    path.join(process.cwd(), "writable");

  async function save(record: InterestRecord): Promise<InterestRecord> {
    const dir = path.join(root, "interest");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${record.id}.json`);
    await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  return { save };
}
