"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  ChartColumn,
  ChartPie,
  ChevronsUpDown,
  ClipboardCheck,
  Ellipsis,
  House,
  ListOrdered,
  LogOut,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClubMenu } from "../../../_components/ClubSwitcher";
import { Mark } from "../../../_components/Mark";
import { useOrg } from "../../../_components/OrgProvider";
import { CountBadge } from "../../../_components/ui/Badge";
import { ICON_STROKE } from "../../../_components/ui/ListRow";
import { Sheet } from "../../../_components/ui/Sheet";
import { useLiveData } from "../../../_components/useLiveData";

// The frame around every club page: one navigation for everyone, based on
// role. Wide screens get a glass rail on the right (labels at 1024px+, icons
// only from 640px); phones get a slim glass top bar and a floating pill tab
// bar. The nav comes before the page in the DOM (with a "Skip to content"
// link); CSS grid puts the rail on the right.

const ICON = { size: 20, strokeWidth: ICON_STROKE, "aria-hidden": true } as const;

type NavItem = {
  key: string;
  href: string;
  label: string;
  short?: string; // shorter label for the phone tab bar
  icon: LucideIcon;
  match: (path: string) => boolean;
  badge?: number;
};

// ---- Shell context: lets pages refresh the Approvals badge ----

const ShellContext = createContext<{ refreshApprovals: () => void }>({ refreshApprovals: () => {} });

/** Pages call refreshApprovals() after approving or denying a request. */
export function useShell() {
  return useContext(ShellContext);
}

// The red Approvals badge: live (every 10 seconds, and right after any
// approve / deny / new receipt). Only fetched for treasurers.
function useApprovalsCount(orgId: string, isTreasurer: boolean) {
  const live = useLiveData<{ waitingCount?: number }>(
    isTreasurer ? `/api/orgs/${orgId}/treasurer/overview` : null,
    { intervalMs: 10_000 },
  );
  const count = typeof live.data?.waitingCount === "number" ? live.data.waitingCount : null;
  return { count: isTreasurer ? count : null, refresh: live.refresh };
}

function useNavItems(approvals: number | null) {
  const { orgId, isTreasurer } = useOrg();
  const base = `/c/${orgId}`;
  const t = `${base}/treasurer`;
  const under = (href: string) => (p: string) => p === href || p.startsWith(`${href}/`);

  const home: NavItem = { key: "home", href: base, label: "Home", icon: House, match: (p) => p === base };
  const reimburse: NavItem = {
    key: "reimburse",
    href: `${base}/reimburse`,
    label: "Get reimbursed",
    short: "Reimburse",
    icon: Receipt,
    match: under(`${base}/reimburse`),
  };
  const budget: NavItem = {
    key: "budget",
    href: isTreasurer ? `${t}/budget` : `${base}/budget`,
    label: "Budget",
    icon: ChartPie,
    match: (p) => under(`${base}/budget`)(p) || under(`${t}/budget`)(p),
  };
  const activity: NavItem = {
    key: "activity",
    href: `${base}/activity`,
    label: "Activity",
    icon: ListOrdered,
    match: under(`${base}/activity`),
  };
  const insights: NavItem = {
    key: "insights",
    href: `${t}/insights`,
    label: "Insights",
    icon: ChartColumn,
    match: under(`${t}/insights`),
  };
  const approvals_: NavItem = {
    key: "approvals",
    href: t,
    label: "Approvals",
    icon: ClipboardCheck,
    match: (p) => p === t,
    badge: approvals ?? undefined,
  };
  const members: NavItem = { key: "members", href: `${t}/members`, label: "Members", icon: Users, match: under(`${t}/members`) };
  const settings: NavItem = {
    key: "settings",
    href: `${t}/settings`,
    label: "Settings",
    icon: Settings,
    match: under(`${t}/settings`),
  };

  return {
    isTreasurer,
    reimburse,
    main: [home, budget, activity],
    manage: isTreasurer ? [insights, approvals_, members, settings] : [],
    tabs: isTreasurer ? [home, insights, approvals_, members] : [home, reimburse, budget, activity],
    more: isTreasurer ? [reimburse, budget, activity, settings] : [],
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { orgId, isTreasurer } = useOrg();
  const pathname = usePathname();
  const { count, refresh } = useApprovalsCount(orgId, isTreasurer);
  const nav = useNavItems(count);

  return (
    <ShellContext.Provider value={{ refreshApprovals: refresh }}>
      <div className="grid min-h-dvh flex-1 grid-cols-1 grid-rows-[auto_1fr] sm:grid-cols-[minmax(0,1fr)_72px] sm:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_240px]">
        <a
          href="#content"
          className="glass-strong sr-only z-[60] rounded-[12px] px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>

        <NavRail nav={nav} pathname={pathname} />
        <TopBar />
        <TabBar nav={nav} pathname={pathname} />

        <div
          id="content"
          tabIndex={-1}
          className="flex min-w-0 flex-col pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none sm:col-start-1 sm:row-start-1 sm:pt-8 sm:pb-0"
        >
          {children}
        </div>
      </div>
    </ShellContext.Provider>
  );
}

// ---- Club switcher (club name + a pop-over with your clubs) ----

function ClubSwitcher({ compact, withLogout }: { compact?: boolean; withLogout?: boolean }) {
  const { club } = useOrg();
  const { logout } = usePrivy();
  // Where the pop-over sits (fixed, just under the button, right edges lined up).
  const [spot, setSpot] = useState<{ top: number; right: number } | null>(null);
  const open = spot !== null;
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setSpot(null);

  function toggle() {
    if (open || !ref.current) return close();
    const r = ref.current.getBoundingClientRect();
    setSpot({ top: r.bottom + 8, right: Math.max(8, document.documentElement.clientWidth - r.right) });
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setSpot(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSpot(null);
    const onResize = () => setSpot(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const name = club?.name ?? "Club Treasury";
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? `${name}: switch club` : undefined}
        title={compact ? name : undefined}
        className={`flex w-full min-w-0 items-center gap-2.5 rounded-[12px] text-left hover:bg-black/[0.04] ${
          compact ? "justify-center p-2" : "px-2 py-2"
        }`}
      >
        <Mark className="h-8 w-8 shrink-0" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-tight font-semibold">{name}</span>
              {club?.school && <span className="block truncate text-[12px] text-muted">{club.school}</span>}
            </span>
            <ChevronsUpDown size={16} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0 text-zinc-400" />
          </>
        )}
      </button>
      {/* Rendered on <body>: the side rail scrolls, so it would clip a pop-over wider than itself. */}
      {spot &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="glass fixed z-50 w-72 max-w-[calc(100vw-1rem)] rounded-[16px] p-2"
            style={{ top: spot.top, right: spot.right, background: "rgb(250 250 252 / 0.95)" }}
          >
            <ClubMenu onNavigate={close} />
            {withLogout && <hr className="my-2 border-black/[0.08]" />}
            {withLogout && (
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="w-full rounded-[10px] px-3 py-2.5 text-left text-sm text-zinc-600 hover:bg-black/[0.05]"
              >
                Log out
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---- Wide screens: the glass rail on the right ----

function RailIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${
        active ? "bg-ink text-white" : "bg-black/[0.05] text-ink"
      }`}
    >
      <Icon size={18} strokeWidth={ICON_STROKE} />
    </span>
  );
}

function RailLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const label = item.badge ? `${item.label} (${item.badge} waiting)` : item.label;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={item.label}
      className={`flex min-h-11 items-center gap-3 rounded-[12px] px-2 text-[15px] font-medium max-lg:justify-center max-lg:px-0 ${
        active ? "glass-strong text-ink" : "border-[0.5px] border-transparent text-zinc-700 hover:bg-black/[0.04] hover:text-ink"
      }`}
    >
      <span className="relative">
        <RailIcon icon={item.icon} active={active} />
        <CountBadge count={item.badge} className="absolute -top-1.5 -right-1.5 lg:hidden" />
      </span>
      <span className="truncate max-lg:sr-only">{item.label}</span>
      <CountBadge count={item.badge} className="ml-auto max-lg:hidden" />
    </Link>
  );
}

function NavRail({ nav, pathname }: { nav: ReturnType<typeof useNavItems>; pathname: string }) {
  const { me } = useOrg();
  const { logout } = usePrivy();
  const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.email || "You";
  const reimburseActive = nav.reimburse.match(pathname);

  return (
    <nav
      aria-label="Club"
      className="glass sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto rounded-none border-y-0 border-r-0 px-3 py-4 sm:col-start-2 sm:row-start-1 sm:flex"
    >
      <div className="hidden lg:block">
        <ClubSwitcher />
      </div>
      <div className="lg:hidden">
        <ClubSwitcher compact />
      </div>

      <Link
        href={nav.reimburse.href}
        aria-current={reimburseActive ? "page" : undefined}
        aria-label={nav.reimburse.label}
        title={nav.reimburse.label}
        className={`mt-3 mb-3 flex min-h-11 items-center justify-center gap-2 rounded-[12px] bg-ink px-3 text-[15px] font-semibold text-white hover:bg-zinc-800 max-lg:px-0 ${
          reimburseActive ? "ring-2 ring-ink ring-offset-2 ring-offset-white" : ""
        }`}
      >
        <nav.reimburse.icon {...ICON} />
        <span className="max-lg:sr-only">{nav.reimburse.label}</span>
      </Link>

      {nav.main.map((item) => (
        <RailLink key={item.key} item={item} pathname={pathname} />
      ))}

      {nav.manage.length > 0 && (
        <>
          <p className="mt-5 mb-1 px-2 text-[12px] font-semibold tracking-wide text-muted uppercase max-lg:sr-only">Manage</p>
          <hr className="my-3 border-black/[0.08] lg:hidden" />
          {nav.manage.map((item) => (
            <RailLink key={item.key} item={item} pathname={pathname} />
          ))}
        </>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-black/[0.08] pt-3">
        <p className="truncate px-2 text-[13px] font-semibold max-lg:sr-only" title={name}>
          {name}
        </p>
        <button
          type="button"
          onClick={logout}
          aria-label="Log out"
          title="Log out"
          className="flex min-h-11 items-center gap-3 rounded-[12px] px-2 text-[15px] text-zinc-700 hover:bg-black/[0.04] hover:text-ink max-lg:justify-center max-lg:px-0"
        >
          <RailIcon icon={LogOut} active={false} />
          <span className="max-lg:sr-only">Log out</span>
        </button>
      </div>
    </nav>
  );
}

// ---- Phones: top bar, floating pill tab bar, and the "More" sheet ----

function TopBar() {
  return (
    <header className="glass sticky top-0 z-30 rounded-none border-x-0 border-t-0 pt-[env(safe-area-inset-top)] sm:hidden">
      <div className="px-2 py-1">
        <ClubSwitcher withLogout />
      </div>
    </header>
  );
}

function TabButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <>
      <span className="relative grid h-7 place-items-center">
        <item.icon size={22} strokeWidth={active ? 2.1 : ICON_STROKE} aria-hidden />
        <CountBadge count={item.badge} className="absolute -top-1 -right-2.5" />
      </span>
      <span aria-hidden className="text-[10px] leading-none font-semibold">
        {item.short ?? item.label}
      </span>
    </>
  );
}

const tabClass = (active: boolean) =>
  `flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-full px-1 ${
    active ? "bg-black/[0.07] text-ink" : "text-zinc-500 hover:text-ink"
  }`;

function TabBar({ nav, pathname }: { nav: ReturnType<typeof useNavItems>; pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { logout } = usePrivy();
  const moreActive = nav.more.some((i) => i.match(pathname));
  const cols = nav.tabs.length + (nav.isTreasurer ? 1 : 0);
  const more: NavItem = { key: "more", href: "", label: "More", icon: Ellipsis, match: () => false };

  return (
    <>
      <nav
        aria-label="Club"
        className="fixed inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 sm:hidden"
      >
        <ul
          className="glass grid gap-0.5 rounded-full p-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, background: "rgb(255 255 255 / 0.72)" }}
        >
          {nav.tabs.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.badge ? `${item.label} (${item.badge} waiting)` : item.label}
                  className={tabClass(active)}
                >
                  <TabButton item={item} active={active} />
                </Link>
              </li>
            );
          })}
          {nav.isTreasurer && (
            <li>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-label="More"
                className={tabClass(moreActive)}
              >
                <TabButton item={more} active={moreActive} />
              </button>
            </li>
          )}
        </ul>
      </nav>
      {moreOpen && (
        <Sheet title="More" side={false} onClose={() => setMoreOpen(false)}>
          <ul className="glass divide-y divide-black/[0.06] overflow-hidden rounded-[16px]">
            {nav.more.map((item) => {
              const active = item.match(pathname);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="flex min-h-12 items-center gap-3 px-3 text-[15px] font-medium hover:bg-black/[0.03]"
                  >
                    <RailIcon icon={item.icon} active={active} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="glass mt-4 rounded-[16px] p-2">
            <ClubMenu onNavigate={() => setMoreOpen(false)} plain />
            <hr className="my-2 border-black/[0.08]" />
            <button
              type="button"
              onClick={logout}
              className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] text-zinc-700 hover:bg-black/[0.04]"
            >
              <LogOut {...ICON} />
              Log out
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
