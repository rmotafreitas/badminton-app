import { useAuth } from "@/hooks/useAuth";
import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { FullPageLoader } from "@/components/ui";
import { useDictionary } from "@/i18n";
import { type Role } from "@/core/domain/roles";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, loading, authPhase, isReconnecting, openLoginModal } = useAuth();
  const common = useDictionary().common;

  useEffect(() => {
    if (!loading && !user) openLoginModal();
  }, [loading, user, openLoginModal]);

  if (loading || authPhase === "restoring") {
    return <FullPageLoader label={common.restoringSession} />;
  }

  if (isReconnecting && user) {
    return <FullPageLoader label={common.reconnecting} />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (
    allowedRoles &&
    user.roles &&
    !user.roles.some((r) => allowedRoles.includes(r))
  ) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
