import { api } from "../api";
import type { ParsedCompanyRow } from "./parseCompanyImport";

const COMPANY_IMPORT_CHUNK_SIZE = 20;

export type ChunkedCompanyImportResult = {
  created: number;
  updated: number;
  skipped: number;
};

/**
 * Keep each serverless invocation short. A timed-out chunk is retried once;
 * merge-on-name makes that retry safe even if the first request wrote rows.
 */
export async function importCompanyRowsInChunks(args: {
  missionId: string;
  sourceId: string;
  listLabel: string;
  rows: ParsedCompanyRow[];
  producer?: "Human" | "ImportedDataset";
  mixed?: boolean;
  place?: string;
  defaultAudience?: string;
  onProgress?: (completed: number, total: number) => void;
}): Promise<ChunkedCompanyImportResult> {
  const totals: ChunkedCompanyImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
  };

  for (
    let offset = 0;
    offset < args.rows.length;
    offset += COMPANY_IMPORT_CHUNK_SIZE
  ) {
    const rows = args.rows.slice(offset, offset + COMPANY_IMPORT_CHUNK_SIZE);
    let result: Awaited<ReturnType<typeof api.importCompanies>> | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await api.importCompanies(args.missionId, {
          sourceId: args.sourceId,
          listLabel: args.listLabel,
          rows,
          producer: args.producer,
          mixed: args.mixed,
          place: args.place,
          defaultAudience: args.defaultAudience,
        });
        break;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }

    if (!result) throw new Error("Company import chunk returned no result");
    totals.created += result.created;
    totals.updated += result.updated;
    totals.skipped += result.skipped;
    args.onProgress?.(
      Math.min(offset + rows.length, args.rows.length),
      args.rows.length,
    );
  }

  return totals;
}
