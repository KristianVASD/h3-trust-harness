import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type WorkerRun } from "../../api";
import { useAuth } from "../../auth/AuthContext";

export function EngineStatusChip({ missionId }: { missionId: string }) {
  const { isAdmin } = useAuth();
  const [run, setRun] = useState<WorkerRun | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.getActiveWorkerRun(missionId);
        if (!cancelled) setRun(res.run);
      } catch {
        if (!cancelled) setRun(null);
      }
    }
    void load();
    const t = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [missionId]);

  if (!run) return null;

  const label = `Engine: ${run.current_action || run.status} · ${run.progress_pct}%`;

  if (isAdmin) {
    return (
      <p className="worker-next-banner">
        <Link to={`/admin/engine/${run.id}`}>{label}</Link>
      </p>
    );
  }

  return <p className="worker-next-banner">{label}</p>;
}
