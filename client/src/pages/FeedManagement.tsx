import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import ModuleNavigationLanding from "@/components/ModuleNavigationLanding";

export default function FeedManagement() {
  const { user, loading } = useAuth();

  return (
    <ModuleNavigationLanding
      moduleKey="feed-management"
      role={user?.role}
      loading={loading}
    />
  );
}
