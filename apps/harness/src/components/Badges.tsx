import type { Producer } from "@h3-trust/schema";

export function ProducerBadge({
  producer,
  status,
}: {
  producer: Producer;
  /** When OmegaClaw + candidate → Ω · provisional (Phase 3 Mirror badge). */
  status?: string;
}) {
  if (producer === "OmegaClaw" && status === "candidate") {
    return (
      <span className="chip producer-OmegaClaw" title="OmegaClaw provisional">
        Ω · provisional
      </span>
    );
  }
  if (producer === "OmegaClaw") {
    return <span className="chip producer-OmegaClaw">Ω · OmegaClaw</span>;
  }
  return <span className={`chip producer-${producer}`}>Producer · {producer}</span>;
}

export function StatusChip({
  label,
  tone = "waiting",
}: {
  label: string;
  tone?: "waiting" | "active" | "done";
}) {
  return <span className={`chip status-${tone}`}>{label}</span>;
}
