import { AppShell } from "@/components/AppShell";

/**
 * Every authenticated route (dashboard, farms, crops, market, lots,
 * trade-offers, shipments, logistics, profile, buyer/fpo/admin/government
 * workspaces, etc.) lives under this route group. Route groups — the
 * "(app)" folder name in parentheses — are invisible in the URL, so
 * /dashboard, /farms, /market etc. are unchanged; this is purely a way to
 * give this whole section of the app one shared layout.
 *
 * Previously each page rendered its own <AppShell> (via RoleProtectedPage
 * or directly), which meant Next.js unmounted and remounted the entire
 * header, nav bar, account menu and mobile drawer on every single
 * navigation — the main cause of navigation feeling slow. AppShell is now
 * mounted exactly once here and persists across all in-app navigation;
 * only the page content underneath it changes.
 */
export default function AuthenticatedAppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
