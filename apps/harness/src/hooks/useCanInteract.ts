import { useAuth } from "../auth/AuthContext";

/** True when the user may mutate (or local open mode). */
export function useCanInteract() {
  const { canWrite, openMode, isPending, authRequired, session } = useAuth();
  return {
    canInteract: canWrite,
    isPending,
    authRequired,
    needsLogin: authRequired && !session,
    openMode,
  };
}
