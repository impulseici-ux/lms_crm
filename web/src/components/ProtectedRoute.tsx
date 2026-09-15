import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-ink-soft">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!role) {
    return (
      <div className="p-8 max-w-lg">
        <div className="rounded-xl border border-warn bg-warn-soft p-5 text-warn">
          Your account has no role assigned yet. Ask an admin to set your role from Admin → Staff.
        </div>
      </div>
    );
  }
  if (roles && !roles.includes(role)) {
    return (
      <div className="p-8 max-w-lg">
        <div className="rounded-xl border border-bad bg-bad-soft p-5 text-bad">
          You don't have permission to view this page.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
