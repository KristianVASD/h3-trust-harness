import { z } from "zod";

/**
 * An access barrier = a gate OmegaClaw CANNOT cross itself. Ω detects it
 * (probe) and raises its hand; a human resolves it. This record is the
 * structural anti-bypass: extract has no path to a blocked source's data
 * except through a human-fulfilled barrier.
 */
export const BarrierKindSchema = z.enum([
  "api-key-application", // apply via form/email to obtain a key
  "email-request", // email the org for the list / CSV
  "manual-lookup", // human looks up one item at a time (KvK single check)
  "login-wall", // member login required to see the list
  "captcha", // bot protection Ω must not solve
  "paid-tier", // data behind a paywall
  "pdf-download", // list is a PDF the human must fetch
  "rate-limited", // Ω hit a limit; human paces the calls
  "unknown",
]);
export type BarrierKind = z.infer<typeof BarrierKindSchema>;

export const BarrierSeveritySchema = z.enum([
  "blocks-extract",
  "partial",
  "soft",
]);
export type BarrierSeverity = z.infer<typeof BarrierSeveritySchema>;

export const BarrierScopeSchema = z.enum(["source", "company"]);
export type BarrierScope = z.infer<typeof BarrierScopeSchema>;

export const BarrierStatusSchema = z.enum([
  "raised",
  "human-acknowledged",
  "human-fulfilled",
  "human-declined",
  "omega-retried",
]);
export type BarrierStatus = z.infer<typeof BarrierStatusSchema>;

/** What the human hands back. NOTE: api_key_ref, never the raw key. */
export const BarrierFulfillmentSchema = z.object({
  kind: z.enum(["api-key", "manual-rows", "file-path", "note"]),
  api_key_ref: z.string().optional(), // a secrets-store ref, NOT the secret
  /** Human-originated company rows (e.g. names the human already knows). */
  manual_companies: z
    .array(
      z.object({
        name: z.string(),
        kvk_number: z.string().optional(),
        address: z.string().optional(),
        specialism: z.string().optional(),
      }),
    )
    .optional(),
  file_path: z.string().optional(),
  note: z.string().optional(),
  by: z.string(), // the curator (provenance)
});
export type BarrierFulfillment = z.infer<typeof BarrierFulfillmentSchema>;

export const AccessBarrierSchema = z.object({
  id: z.string().uuid(),
  scope: BarrierScopeSchema.default("source"),
  kind: BarrierKindSchema,
  severity: BarrierSeveritySchema,
  what_omega_needs: z.string(), // Ω's ask, plain language (dual-label: Ω)
  what_human_does: z.string(), // the concrete action for the human
  free_tier_available: z.boolean().default(false),
  estimated_effort: z
    .enum(["trivial", "minutes", "hours", "days"])
    .optional(),
  status: BarrierStatusSchema.default("raised"),
  raised_at: z.string().datetime(),
  fulfilled_at: z.string().datetime().optional(),
  fulfillment: BarrierFulfillmentSchema.optional(),
});
export type AccessBarrier = z.infer<typeof AccessBarrierSchema>;

/** A barrier is "active & blocking" until a human fulfils or declines it. */
export function isBlockingBarrier(b: AccessBarrier): boolean {
  return (
    b.severity === "blocks-extract" &&
    b.status !== "human-fulfilled" &&
    b.status !== "human-declined"
  );
}
