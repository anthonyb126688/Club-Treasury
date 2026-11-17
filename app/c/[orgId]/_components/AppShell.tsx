"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  ChartPie,
  ChevronsUpDown,
  ClipboardCheck,
  Ellipsis,
  House,
  LogOut,
  Receipt,
  ScrollText,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ClubMenu } from "../../../_components/ClubSwitcher";
import { Mark } from "../../../_components/Mark";
import { useOrg } from "../../../_components/OrgProvider";
import { useAuthFetch } from "../../../_components/useAuthFetch";

// The frame around every club page: one navigation for everyone, based on
// role. Wide screens get a rail on the right (labels at 1024px+, icons only
// from 640px); phones get a slim top bar and a tab bar at the bottom.
// The nav comes before the page in the page order (with a "Skip to
// content" link); CSS grid puts it on the right.

const ICON = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

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

function useApprovalsCount(orgId: string, isTreasurer: boolean, pathname: string) {
  const authFetch = useAuthFetch();
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!isTreasurer) return;
    try {
      const res = await authFetch(`/api/orgs/${orgId}/treasurer/overview`);
      if (!res.ok) return;
      const body = (await res.json()) as { waitingCount?: number };
      if (typeof body.waitingCount === "number") setCount(body.waitingCount);
    } catch {
      // Keep the last count.
    }
  }, [authFetch, orgId, isTreasurer]);

  useEffect(() => {
    if (!isTreasurer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the badge
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load, isTreasurer, pathname]);

  return { count: isTreasurer ? count : null, refresh: load };
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
  const ledger: NavItem = {
    key: "ledger",
    href: `${base}/ledger`,
    label: "Ledger",
    icon: ScrollText,
    match: under(`${base}/ledger`),
  };
  const approvalsItem: NavItem = {
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
    main: [home, budget, ledger],
    manage: isTreasurer ? [approvalsItem, members, settings] : [],
    tabs: isTreasurer ? [home, approvalsItem, reimburse, members] : [home, reimburse, budget, ledger],
    more: isTreasurer ? [budget, ledger, settings] : [],
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { orgId, isTreasurer } = useOrg();
  const pathname = usePathname();
  const { count, refresh } = useApprovalsCount(orgId, isTreasurer, pathname);
  const nav = useNavItems(count);

  return (
    <ShellContext.Provider value={{ refreshApprovals: refresh }}>
      <div className="grid min-h-dvh flex-1 grid-cols-1 grid-rows-[auto_1fr] sm:grid-rows-1 sm:grid-cols-[minmax(0,1fr)_72px] lg:grid-cols-[minmax(0,1fr)_240px]">
        <a
          href="#content"
          className="sr-only z-50 rounded-xl bg-white px-4 py-2 font-medium shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3 dark:bg-zinc-900"
        >
          Skip to content
        </a>

        <NavRail nav={nav} pathname={pathname} />
        <TopBar />
        <TabBar nav={nav} pathname={pathname} />

        <div
          id="content"
          tabIndex={-1}
          className="flex min-w-0 flex-col pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none sm:col-start-1 sm:row-start-1 sm:pt-8 sm:pb-0"
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = club?.name ?? "Club Treasury";
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? `${name}: switch club` : undefined}
        title={compact ? name : undefined}
        className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
          compact ? "justify-center p-2" : "px-2 py-2"
        }`}
      >
        <Mark className="h-8 w-8 shrink-0" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display font-semibold leading-tight">{name}</span>
              {club?.school && <span className="block truncate text-xs text-zinc-500">{club.school}</span>}
            </span>
            <ChevronsUpDown size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-zinc-400" />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_12px_40px_-12px_rgb(13_18_16/0.25)] dark:border-zinc-800 dark:bg-zinc-900"
        >
          <ClubMenu onNavigate={() => setOpen(false)} />
          {withLogout && (
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Log out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Wide screens: the rail on the right ----

function Badge({ n, dot }: { n?: number; dot?: boolean }) {
  if (!n) return null;
  if (dot) {
    return (
      <span className="absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-gold-400 px-1 text-[10px] font-semibold text-brand-950 tabular-nums">
        {n > 99 ? "99+" : n}
      </span>
    );
  }
  return (
    <span className="ml-auto rounded-full bg-gold-400 px-2 py-0.5 text-xs font-semibold text-brand-950 tabular-nums">
      {n > 99 ? "99+" : n}
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
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium max-lg:justify-center max-lg:px-0 ${
        active
          ? "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
      }`}
    >
      <span className="relative shrink-0">
        <item.icon {...ICON} />
        <span className="lg:hidden">
          <Badge n={item.badge} dot />
        </span>
      </span>
      <span className="truncate max-lg:sr-only">{item.label}</span>
      <span className="max-lg:hidden contents">
        <Badge n={item.badge} />
      </span>
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
      className="sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto border-l border-zinc-200 bg-white px-3 py-4 sm:col-start-2 sm:row-start-1 sm:flex dark:border-zinc-800 dark:bg-zinc-900"
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
        className={`mt-3 mb-2 flex min-h-11 items-center gap-3 rounded-xl bg-gold-400 px-3 text-sm font-semibold text-brand-950 hover:bg-gold-300 max-lg:justify-center max-lg:px-0 ${
          reimburseActive ? "ring-2 ring-brand-800 ring-offset-2 ring-offset-white dark:ring-gold-200 dark:ring-offset-zinc-900" : ""
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
          <p className="mt-4 mb-1 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500 max-lg:sr-only">Manage</p>
          <hr className="my-3 border-zinc-200 lg:hidden dark:border-zinc-800" />
          {nav.manage.map((item) => (
            <RailLink key={item.key} item={item} pathname={pathname} />
          ))}
        </>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p className="truncate px-3 text-sm font-medium max-lg:sr-only" title={name}>
          {name}
        </p>
        <button
          type="button"
          onClick={logout}
          aria-label="Log out"
          title="Log out"
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 max-lg:justify-center max-lg:px-0 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          <LogOut {...ICON} />
          <span className="max-lg:sr-only">Log out</span>
        </button>
      </div>
    </nav>
  );
}

// ---- Phones: top bar, bottom tab bar, and the "More" sheet ----

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-[color-mix(in_oklab,var(--background)_88%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur sm:hidden dark:border-zinc-800/70">
      <div className="px-2 py-1.5">
        <ClubSwitcher withLogout />
      </div>
    </header>
  );
}

const tabClass = (active: boolean) =>
  `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium ${
    active ? "text-brand-800 dark:text-brand-200" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
  }`;

function TabIcon({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <span
      className={`relative grid h-7 w-12 place-items-center rounded-full ${active ? "bg-brand-100 dark:bg-brand-900" : ""}`}
    >
      <item.icon {...ICON} />
      <Badge n={item.badge} dot />
    </span>
  );
}

function TabBar({ nav, pathname }: { nav: ReturnType<typeof useNavItems>; pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreActive = nav.more.some((i) => i.match(pathname));
  const cols = nav.tabs.length + (nav.isTreasurer ? 1 : 0);

  return (
    <>
      <nav
        aria-label="Club"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
      >
        <ul className="grid px-1 pt-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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
                  <TabIcon item={item} active={active} />
                  <span aria-hidden>{item.short ?? item.label}</span>
                </Link>
              </li>
            );
          })}
          {nav.isTreasurer && (
            <li>
              <button
                ref={moreButton}
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                className={`w-full ${tabClass(moreActive)}`}
              >
                <TabIcon item={{ key: "more", href: "", label: "More", icon: Ellipsis, match: () => false }} active={moreActive} />
                <span>More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
      {moreOpen && (
        <MoreSheet
          items={nav.more}
          pathname={pathname}
          onClose={() => {
            setMoreOpen(false);
            moreButton.current?.focus();
          }}
        />
      )}
    </>
  );
}

function MoreSheet({ items, pathname, onClose }: { items: NavItem[]; pathname: string; onClose: () => void }) {
  const { logout } = usePrivy();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Focus the first link when the sheet opens; Escape closes it.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("ul a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 sm:hidden">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/40 active:transform-none"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="sheet-up absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white px-3 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgb(13_18_16/0.3)] dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between px-2 py-2">
          <p className="font-display text-lg font-semibold">More</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X {...ICON} />
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium ${
                    active
                      ? "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <item.icon {...ICON} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <hr className="my-3 border-zinc-200 dark:border-zinc-800" />
        <ClubMenu onNavigate={onClose} plain />
        <button
          type="button"
          onClick={logout}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <LogOut {...ICON} />
          Log out
        </button>
      </div>
    </div>
  );
}
