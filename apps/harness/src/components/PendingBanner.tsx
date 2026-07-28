/** Banner when a pending CURAD volunteer can browse but not write. */
export function PendingBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pending-banner" role="status">
      Your CURAD application is pending admin approval. You can look around, but
      Agree / Adjust / Dissent and other writes stay locked for now.
    </div>
  );
}
