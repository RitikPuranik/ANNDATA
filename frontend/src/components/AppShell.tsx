"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X, ChevronDown, Bell, Search, CircleUserRound, Plus, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { NAV_BY_ROLE, ROLE_LABEL, type NavItem } from "@/components/nav/navConfig";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { OnboardingTour } from "@/components/OnboardingTour";

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
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn("app-nav-link", compact && "app-nav-link-compact", active && "active")}
      data-tour={item.href === "/profile" ? "profile" : `nav-${item.href}`}
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
    if (picked.length === 6) break;
  }
  if (picked.length < 6) {
    for (const item of items) {
      if (!picked.some((x) => x.href === item.href)) picked.push(item);
      if (picked.length === 6) break;
    }
  }
  return picked;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  React.useEffect(() => {
    const openFromTour = () => setDrawerOpen(true);
    window.addEventListener("anndata:open-menu", openFromTour);
    return () => window.removeEventListener("anndata:open-menu", openFromTour);
  }, []);

  React.useEffect(() => {
    setMoreOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  if (!user) return <>{children}</>;

  const navItems = NAV_BY_ROLE[user.role] ?? [];
  const primary = choosePrimary(navItems);
  const secondary = navItems.filter((item) => !primary.some((x) => x.href === item.href));
  const initials = user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";

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

        <div className="header-workspace" aria-label="Current workspace">
          <span>WORKSPACE</span>
          <b>{ROLE_LABEL[user.role]}</b>
        </div>

        <div className="topbar-search" role="search">
          <Search className="h-4 w-4" />
          <span>Search your crops, farms or market…</span>
          <kbd>⌘ K</kbd>
        </div>

        <div className="topbar-actions">
          <Link href="/lots/new" className="header-list-button"><Plus className="h-4 w-4" /> Sell produce</Link>
          <Link href="/shipments" className="header-utility desktop-only" title="Orders & shipments"><ShoppingBag className="h-[17px] w-[17px]" /><span>Activity</span></Link>
          <LanguageSwitcher />
          <button className="icon-btn notification-btn" aria-label="Notifications"><Bell /></button>

          <div className="account-wrap desktop-only">
            <button className="account-trigger" onClick={() => setAccountOpen((v) => !v)} aria-expanded={accountOpen}>
              <span className="avatar small" translate="no">{initials}</span>
              <span className="account-copy"><b>Account</b><small>{ROLE_LABEL[user.role]}</small></span>
              <ChevronDown className={cn("h-3.5 w-3.5", accountOpen && "rotate-180")} />
            </button>
            {accountOpen && <>
              <button className="account-backdrop" aria-label="Close account menu" onClick={() => setAccountOpen(false)} />
              <div className="account-menu">
                <div className="account-menu-head"><span className="avatar" translate="no">{initials}</span><div><b translate="no">{user.fullName}</b><small>{ROLE_LABEL[user.role]}</small></div></div>
                <Link href="/profile" onClick={() => setAccountOpen(false)}><CircleUserRound /> Profile & account</Link>
                <button onClick={handleLogout} disabled={loggingOut}><LogOut /> {loggingOut ? "Signing out…" : "Sign out"}</button>
              </div>
            </>}
          </div>
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
                <div className="nav-more-head"><div><b>All workspace tools</b><span>Everything available to you</span></div><span className="nav-more-role">{ROLE_LABEL[user.role]}</span></div>
                <div className="nav-more-grid">{secondary.map((item) => <NavLink key={item.href} item={item} compact onClick={() => setMoreOpen(false)} />)}</div>
                <Link href="/profile" className="nav-profile-link" onClick={() => setMoreOpen(false)}><CircleUserRound className="h-4 w-4" /> Profile & account</Link>
              </div>
            </>}
          </div>

          {primary.map((item) => <NavLink key={item.href} item={item} />)}
          <span className="nav-spacer" />
          <Link href="/shipments" className="nav-end-link">My activity</Link>
        </div>
      </nav>

      <div className="app-main"><main className="app-content" data-tour="dashboard-main">{children}</main></div>

      {drawerOpen && <div className="mobile-drawer-backdrop" onClick={() => setDrawerOpen(false)}><aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><Brand /><button className="icon-btn" onClick={() => setDrawerOpen(false)}><X /></button></div>
        <div className="drawer-workspace"><span>WORKSPACE</span><b>{ROLE_LABEL[user.role]}</b></div>
        <nav className="mobile-drawer-nav">{navItems.map((item) => <NavLink key={item.href} item={item} onClick={() => setDrawerOpen(false)} />)}</nav>
        <Link href="/profile" className="app-user-card" onClick={() => setDrawerOpen(false)}><span className="avatar" translate="no">{initials}</span><span className="min-w-0"><b translate="no">{user.fullName}</b><small>{ROLE_LABEL[user.role]}</small></span><CircleUserRound className="ml-auto h-4 w-4 opacity-50" /></Link>
        <button className="app-logout" onClick={handleLogout} disabled={loggingOut}><LogOut className="h-4 w-4" /> {loggingOut ? "Signing out…" : "Sign out"}</button>
      </aside></div>}

      <nav className="mobile-bottom-nav">
        {primary.slice(0, 4).map((item) => { const Icon = item.icon; const active = isActive(pathname, item); return <Link key={item.href} href={item.href} className={cn(active && "active")}><Icon /><span>{item.label}</span></Link>; })}
        <button onClick={() => setDrawerOpen(true)}><Menu /><span>All</span></button>
      </nav>
      <OnboardingTour />
    </div>
  );
}
