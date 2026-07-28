import path from "node:path";
import { FileStore } from "./file-store.js";
import { PostgresStore, type PostgresStoreOptions } from "./postgres-store.js";
import type { Store } from "./types.js";

export type StoreDriver = "file" | "postgres";

export type CreateStoreOptions = {
  driver?: StoreDriver;
  /** Absolute path for FileStore root (writable/). */
  writableRoot?: string;
  postgres?: PostgresStoreOptions;
};

export function resolveStoreDriver(
  explicit?: string | StoreDriver,
): StoreDriver {
  const raw = (explicit ?? process.env.STORE_DRIVER ?? "file").toLowerCase();
  if (raw === "postgres" || raw === "supabase") return "postgres";
  return "file";
}

/**
 * Pick FileStore (local) or PostgresStore (Vercel / Supabase).
 */
export function createStore(options: CreateStoreOptions = {}): Store {
  const driver = resolveStoreDriver(options.driver);
  if (driver === "postgres") {
    const url =
      options.postgres?.url ?? process.env.SUPABASE_URL ?? "";
    const serviceRoleKey =
      options.postgres?.serviceRoleKey ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "";
    if (!url || !serviceRoleKey) {
      throw new Error(
        "STORE_DRIVER=postgres requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    return new PostgresStore({ url, serviceRoleKey });
  }

  const root =
    options.writableRoot ??
    process.env.WRITABLE_ROOT ??
    path.resolve(process.cwd(), "writable");
  return new FileStore(root);
}

export function isPostgresStore(store: Store): store is PostgresStore {
  return store instanceof PostgresStore;
}
