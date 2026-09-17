import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";
import { ShieldAlert, ShieldX, Loader2 } from "lucide-react";

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2.5 text-ink-soft bg-bg">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-8">
        <div className="max-w-md w-full rounded-2xl border border-warn/25 bg-warn-soft p-6 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-warn shrink-0 mt-0.5" />
          <p className="text-sm text-ink">Your account has no role assigned yet. Ask an admin to set your role from Admin → Staff.</p>
        </div>
      </div>
    );
  }
  if (roles && !roles.includes(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-8">
        <div className="max-w-md w-full rounded-2xl border border-bad/25 bg-bad-soft p-6 flex gap-3">
          <ShieldX className="w-5 h-5 text-bad shrink-0 mt-0.5" />
          <p className="text-sm text-ink">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
