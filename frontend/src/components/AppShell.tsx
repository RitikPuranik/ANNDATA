"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X, ChevronDown, Bell, Search, Plus, ShoppingBag, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { NAV_BY_ROLE, ROLE_LABEL, type NavItem } from "@/components/nav/navConfig";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useQueryClient } from "@tanstack/react-query";
import { lotApi } from "@/services/lotApi";
import { tradeOfferApi } from "@/services/tradeApi";
import { farmerApi } from "@/services/farmerApi";
import { FARMER_ME_QUERY_KEY } from "@/hooks/useFarmerProfile";

function isActive(pathname: string, item: NavItem) {
  if (["/dashboard", "/buyer", "/fpo", "/admin", "/government"].includes(item.href)) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function Brand() {
  return (
    <Link href="/" className="app-brand">
      <span className="app-brand-mark"><LogoMark className="h-5 w-5" /></span>
      <span>Anndata</span>
    </Link>
  );
}

function NavLink({ item, onClick, compact = false }: { item: NavItem; onClick?: () => void; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const active = isActive(pathname, item);
  const Icon = item.icon;

  const warmRoute = React.useCallback(() => {
    router.prefetch(item.href);
    if (item.href === "/dashboard") {
      void queryClient.prefetchQuery({ queryKey: ["lots", "mine"], queryFn: () => lotApi.listMine() });
      void queryClient.prefetchQuery({ queryKey: ["trade-offers", "mine"], queryFn: tradeOfferApi.list });
    } else if (item.href === "/farms") {
      void queryClient.prefetchQuery({ queryKey: FARMER_ME_QUERY_KEY, queryFn: farmerApi.getMe });
    }
  }, [item.href, queryClient, router]);
  return (
    <Link
      href={item.href}
      onClick={(e) => {
        onClick?.();
        if (item.href !== window.location.pathname) window.dispatchEvent(new CustomEvent("anndata:navigate-start"));
      }}
      prefetch
      onMouseEnter={warmRoute}
      onFocus={warmRoute}
      onMouseDown={warmRoute}
      onTouchStart={warmRoute}
      className={cn("app-nav-link", compact && "app-nav-link-compact", active && "active")}
      data-tour={`nav-${item.href}`}
    >
      <span className="app-nav-icon"><Icon className="h-[15px] w-[15px]" /></span>
      <span>{item.label}</span>
    </Link>
  );
}

function choosePrimary(items: NavItem[]) {
  const preferred = [
    "Dashboard",
    "Farms",
    "Crops",
    "My Produce",
    "Market",
    "Offers",
    "My Demands",
    "Members",
    "Pooled Lots",
    "Available Loads",
    "Overview",
    "Transport Network",
    "Storage Operations",
  ];
  const picked: NavItem[] = [];
  for (const label of preferred) {
    const item = items.find((x) => x.label === label);
    if (item && !picked.some((x) => x.href === item.href)) picked.push(item);
    if (picked.length === 5) break;
  }
  if (picked.length < 5) {
    for (const item of items) {
      if (!picked.some((x) => x.href === item.href)) picked.push(item);
      if (picked.length === 5) break;
    }
  }
  return picked;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "F";
}

function AccountMenu({ onLogout, loggingOut }: { onLogout: () => void; loggingOut: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!user) return null;
  const roleLabel = ROLE_LABEL[user.role] ?? "Farmer";
  const firstName = user.fullName.trim().split(/\s+/)[0] || "Farmer";

  return (
    <div className="anndata-account" ref={ref}>
      <button
        type="button"
        className={cn("anndata-account-trigger", open && "is-open")}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open account menu"
      >
        <span className="anndata-account-avatar">{initials(user.fullName)}</span>
        <span className="anndata-account-text">
          <b>{firstName}</b>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown className="anndata-account-chevron" />
      </button>

      {open && (
        <div className="anndata-account-panel" role="menu">
          <div className="anndata-account-identity">
            <span className="anndata-account-avatar anndata-account-avatar-lg">{initials(user.fullName)}</span>
            <span className="anndata-account-identity-copy">
              <b title={user.fullName}>{user.fullName}</b>
              <small>{roleLabel}</small>
              <em><span /> Active account</em>
            </span>
          </div>

          <div className="anndata-account-section-label">Your account</div>
          <Link href="/profile" className="anndata-account-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="anndata-account-item-icon"><User /></span>
            <span><b>My Profile</b><small>Personal and farm details</small></span>
            <span className="anndata-account-arrow">›</span>
          </Link>

          <div className="anndata-account-divider" />
          <button className="anndata-account-signout" onClick={onLogout} disabled={loggingOut} role="menuitem">
            <span className="anndata-account-signout-icon"><LogOut /></span>
            <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const navItems = React.useMemo(() => (user ? NAV_BY_ROLE[user.role] ?? [] : []), [user]);
  const primary = React.useMemo(() => choosePrimary(navItems), [navItems]);
  // Keep the main navigation unchanged. Only hide account/identity items from the All menu.
  const secondary = React.useMemo(() => {
    const hiddenFromAll = new Set(["Profile", "Account", "Farmer", "Workspace"]);
    return navItems.filter((item) => !primary.some((x) => x.href === item.href) && !hiddenFromAll.has(item.label));
  }, [navItems, primary]);

  React.useEffect(() => {
    const openFromTour = () => setDrawerOpen(true);
    window.addEventListener("anndata:open-menu", openFromTour);
    return () => window.removeEventListener("anndata:open-menu", openFromTour);
  }, []);

  React.useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Warm the most-used routes in the background so navigation is ready before
  // the user clicks. This must run on every render regardless of whether the
  // user is signed in yet — hooks can never be called conditionally — so it
  // guards itself internally instead of sitting after the early return below.
  React.useEffect(() => {
    if (!user) return;
    const routes = [...primary, ...secondary].map((item) => item.href);
    const warm = () => routes.forEach((href) => router.prefetch(href));
    const id = window.setTimeout(warm, 120);
    return () => window.clearTimeout(id);
  }, [router, user, primary, secondary]);

  if (!user) return <>{children}</>;

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); } finally { router.replace("/login"); setLoggingOut(false); }
  }

  return (
    <div className="app-frame">
      <header className="app-header-top">
        <div className="mobile-only">
          <button className="icon-btn header-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Menu /></button>
        </div>

        <Brand />

        <div className="topbar-search" role="search">
          <Search className="h-4 w-4" />
          <span>Search your crops, farms or market…</span>
        </div>

        <div className="topbar-actions">
          <Link href="/lots/new" className="header-list-button"><Plus className="h-4 w-4" /> Sell produce</Link>
          <Link href="/shipments" className="header-utility desktop-only" title="My activity"><ShoppingBag className="h-[17px] w-[17px]" /><span>Activity</span></Link>
          <LanguageSwitcher />
          <button className="icon-btn notification-btn" aria-label="Notifications"><Bell /></button>
          <AccountMenu onLogout={handleLogout} loggingOut={loggingOut} />
        </div>
      </header>

      <nav className="app-nav" data-tour="nav">
        <div className="app-nav-inner">
          <div className="nav-all-wrap">
            <button className={cn("nav-all-button", moreOpen && "active")} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
              <Menu className="h-4 w-4" /> <span>All</span> <ChevronDown className={cn("h-3.5 w-3.5", moreOpen && "rotate-180")} />
            </button>
            {moreOpen && <>
              <button className="nav-menu-backdrop" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
              <div className="nav-more-menu">
                <div className="nav-more-head"><div><b>All workspace tools</b><span>Everything available to you</span></div></div>
                <div className="nav-more-grid">{secondary.map((item) => <NavLink key={item.href} item={item} compact onClick={() => setMoreOpen(false)} />)}</div>
              </div>
            </>}
          </div>

          {primary.map((item) => <NavLink key={item.href} item={item} />)}
          <span className="nav-spacer" />
          <Link href="/shipments" className="nav-end-link"><ShoppingBag className="h-4 w-4" /><span>My Activity</span><small>Orders & deliveries</small></Link>
        </div>
      </nav>

      <div className="app-main"><main className="app-content" data-tour="dashboard-main">{children}</main></div>

      {drawerOpen && <div className="mobile-drawer-backdrop" onClick={() => setDrawerOpen(false)}><aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><Brand /><button className="icon-btn" onClick={() => setDrawerOpen(false)}><X /></button></div>
        <Link href="/profile" className="app-user-card" onClick={() => setDrawerOpen(false)}>
          <span className="avatar">{initials(user.fullName)}</span>
          <span className="min-w-0"><b className="block truncate">{user.fullName}</b><small className="block truncate">{ROLE_LABEL[user.role] ?? "Farmer"}{user.mobile ? ` · ${user.mobile}` : ""}</small></span>
        </Link>
        <nav className="mobile-drawer-nav">{navItems.map((item) => <NavLink key={item.href} item={item} onClick={() => setDrawerOpen(false)} />)}</nav>
        <button className="app-logout" onClick={handleLogout} disabled={loggingOut}><LogOut className="h-4 w-4" /> {loggingOut ? "Signing out…" : "Sign out"}</button>
      </aside></div>}

      <OnboardingTour />
    </div>
  );
}
