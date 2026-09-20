"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import LandingPage from "@/components/marketing/LandingPage";

export default function RootPage() {
  const { isAuthenticated, homeRoute } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (isAuthenticated) router.replace(homeRoute);
  }, [isAuthenticated, homeRoute, router]);

  // Do not block the landing page while the auth check is warming the
  // backend. This is especially important when the Render API has been
  // sleeping: the landing page can paint immediately while useAuth()
  // performs its background session check and wakes the API.
  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#15150f]">
        <Loader2 className="h-8 w-8 animate-spin text-[#e3b23c]" aria-hidden />
      </div>
    );
  }

  return <LandingPage />;
}
