// Onboarding decisions: where a person goes after login, name checks, what
// "Request to join" does, and dollar inputs on the setup screens.
// Pure (no "server-only"), so the client screens and API routes share it.
// Tested in tests/onboarding.test.ts.

import type { MembershipStatus } from "./decide-access";

export const NAME_MAX = 40;
export const CLUB_TEXT_MAX = 80;

// ---- Names --------------------------------------------------------------------

/** Trim and squash runs of spaces: "  Ada   Mae " → "Ada Mae". */
export function cleanName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export type NameCheck =
  | { ok: true; firstName: string; lastName: string }
  | { ok: false; error: string };

/** First + last name, each 1–40 characters, no hidden control characters. */
export function checkNames(input: { firstName: string; lastName: string }): NameCheck {
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);
  const control = /[\u0000-\u001f\u007f]/;
  if (!firstName) return { ok: false, error: "Enter your first name." };
  if (!lastName) return { ok: false, error: "Enter your last name." };
  if (firstName.length > NAME_MAX || lastName.length > NAME_MAX) {
    return { ok: false, error: `Names can be up to ${NAME_MAX} characters.` };
  }
  if (control.test(firstName) || control.test(lastName)) {
    return { ok: false, error: "Names can only use normal letters and spaces." };
  }
  return { ok: true, firstName, lastName };
}

/** Club name / school: 1–80 characters after tidying. Null if not usable. */
export function cleanClubText(input: string): string | null {
  const text = cleanName(input);
  if (!text || text.length > CLUB_TEXT_MAX || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

// ---- Where to go after login --------------------------------------------------

export type HomeInput = {
  firstName: string | null;
  lastName: string | null;
  lastOrgId: string | null;
  clubs: { id: string; status: string }[];
};

export type HomeDestination =
  | { to: "name" } // ask for their name first
  | { to: "club"; orgId: string } // straight to a club they're in
  | { to: "waiting"; orgId: string } // asked to join; not approved yet
  | { to: "start" }; // create or join a club

export function homeDestination(me: HomeInput): HomeDestination {
  if (!me.firstName?.trim() || !me.lastName?.trim()) return { to: "name" };
  const active = me.clubs.filter((c) => c.status === "active");
  const club = active.find((c) => c.id === me.lastOrgId) ?? active[0];
  if (club) return { to: "club", orgId: club.id };
  const pending = me.clubs.filter((c) => c.status === "pending");
  // The most recent request (clubs come oldest first).
  const waiting = pending.find((c) => c.id === me.lastOrgId) ?? pending[pending.length - 1];
  if (waiting) return { to: "waiting", orgId: waiting.id };
  return { to: "start" };
}

// ---- Request to join ----------------------------------------------------------

export type JoinAction =
  | "insert" // never asked before: add a pending request
  | "reopen" // declined or removed before: set back to pending
  | "already_pending" // nothing to do; keep waiting
  | "already_active"; // already in: just go to the club

export function joinAction(existing: MembershipStatus | null): JoinAction {
  if (existing === null) return "insert";
  if (existing === "active") return "already_active";
  if (existing === "pending") return "already_pending";
  return "reopen";
}

// ---- Dollar inputs ------------------------------------------------------------

/**
 * "25", "$25.50", "1,000" → whole cents. Null if it isn't a plain dollar
 * amount between min and max cents (inclusive).
 */
export function parseDollarsToCents(input: string, limits: { minCents: number; maxCents: number }): number | null {
  const text = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (cents < limits.minCents || cents > limits.maxCents) return null;
  return cents;
}

/** 2500 → "25", 2550 → "25.50" (for prefilling an input). */
export function centsToInput(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(dollars) : `${dollars}.${String(rest).padStart(2, "0")}`;
}

/** The link people open to join: https://app.example/join/KUBI-4821 */
export function inviteUrl(origin: string, joinCode: string): string {
  return `${origin.replace(/\/+$/, "")}/join/${encodeURIComponent(joinCode)}`;
}
