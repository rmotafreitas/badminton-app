import { useAuth } from "@/hooks/useAuth";
import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { type Role } from "@/core/domain/roles";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, loading, openLoginModal } = useAuth();

  useEffect(() => {
    if (!loading && !user) openLoginModal();
  }, [loading, user, openLoginModal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
      </div>
    );
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
