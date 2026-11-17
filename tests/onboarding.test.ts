import { describe, expect, it } from "vitest";
import { normalizeJoinCode } from "@/lib/orgs/join-code";
import {
  centsToInput,
  checkNames,
  cleanClubText,
  homeDestination,
  inviteUrl,
  joinAction,
  parseDollarsToCents,
  type HomeInput,
} from "@/lib/orgs/onboarding";

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const CLUB_C = "cccccccc-0000-4000-8000-000000000003";

const me = (over: Partial<HomeInput> = {}): HomeInput => ({
  firstName: "Ada",
  lastName: "Lovelace",
  lastOrgId: null,
  clubs: [],
  ...over,
});

describe("homeDestination", () => {
  it("asks for a name first", () => {
    expect(homeDestination(me({ firstName: null }))).toEqual({ to: "name" });
    expect(homeDestination(me({ lastName: "  " }))).toEqual({ to: "name" });
    // Even someone already in a club.
    expect(homeDestination(me({ firstName: null, clubs: [{ id: CLUB_A, status: "active" }] }))).toEqual({
      to: "name",
    });
  });

  it("no clubs → create or join", () => {
    expect(homeDestination(me())).toEqual({ to: "start" });
  });

  it("goes to the last club if still active there", () => {
    const clubs = [
      { id: CLUB_A, status: "active" },
      { id: CLUB_B, status: "active" },
    ];
    expect(homeDestination(me({ clubs, lastOrgId: CLUB_B }))).toEqual({ to: "club", orgId: CLUB_B });
  });

  it("falls back to the first active club if the last one is gone", () => {
    const clubs = [
      { id: CLUB_A, status: "pending" },
      { id: CLUB_B, status: "active" },
    ];
    expect(homeDestination(me({ clubs, lastOrgId: CLUB_C }))).toEqual({ to: "club", orgId: CLUB_B });
  });

  it("an active club wins over a pending request", () => {
    const clubs = [
      { id: CLUB_A, status: "pending" },
      { id: CLUB_B, status: "active" },
    ];
    expect(homeDestination(me({ clubs, lastOrgId: CLUB_A }))).toEqual({ to: "club", orgId: CLUB_B });
  });

  it("only a pending request → waiting screen for the newest one", () => {
    const clubs = [
      { id: CLUB_A, status: "pending" },
      { id: CLUB_B, status: "pending" },
    ];
    expect(homeDestination(me({ clubs }))).toEqual({ to: "waiting", orgId: CLUB_B });
  });
});

describe("checkNames", () => {
  it("tidies spaces", () => {
    expect(checkNames({ firstName: "  Ada  Mae ", lastName: " Lovelace" })).toEqual({
      ok: true,
      firstName: "Ada Mae",
      lastName: "Lovelace",
    });
  });

  it("needs both names", () => {
    expect(checkNames({ firstName: "", lastName: "L" }).ok).toBe(false);
    expect(checkNames({ firstName: "A", lastName: "   " }).ok).toBe(false);
  });

  it("allows 40 characters, not 41", () => {
    expect(checkNames({ firstName: "a".repeat(40), lastName: "b" }).ok).toBe(true);
    const tooLong = checkNames({ firstName: "a".repeat(41), lastName: "b" });
    expect(tooLong).toEqual({ ok: false, error: "Names can be up to 40 characters." });
  });

  it("rejects hidden control characters", () => {
    expect(checkNames({ firstName: "Ada\u0000", lastName: "L" }).ok).toBe(false);
  });

  it("keeps accents and apostrophes", () => {
    expect(checkNames({ firstName: "Zoë", lastName: "O'Brien-Nguyễn" }).ok).toBe(true);
  });
});

describe("cleanClubText", () => {
  it("tidies and limits to 80 characters", () => {
    expect(cleanClubText("  Kubing   Club ")).toBe("Kubing Club");
    expect(cleanClubText("")).toBeNull();
    expect(cleanClubText("x".repeat(81))).toBeNull();
  });
});

describe("joinAction", () => {
  it("new → insert; declined/removed → ask again", () => {
    expect(joinAction(null)).toBe("insert");
    expect(joinAction("declined")).toBe("reopen");
    expect(joinAction("removed")).toBe("reopen");
  });

  it("pending or active → nothing to change", () => {
    expect(joinAction("pending")).toBe("already_pending");
    expect(joinAction("active")).toBe("already_active");
  });
});

describe("join codes as people type them", () => {
  it("normalizes the usual ways of typing a code", () => {
    expect(normalizeJoinCode("kubi 4821")).toBe("KUBI-4821");
    expect(normalizeJoinCode(" KUBI-4821 ")).toBe("KUBI-4821");
    expect(normalizeJoinCode("kubi4821")).toBe("KUBI-4821");
    expect(normalizeJoinCode("kub 4821")).toBeNull();
  });
});

describe("parseDollarsToCents", () => {
  const any = { minCents: 0, maxCents: 1_000_000 };

  it("reads plain dollar amounts", () => {
    expect(parseDollarsToCents("25", any)).toBe(2500);
    expect(parseDollarsToCents("$25.5", any)).toBe(2550);
    expect(parseDollarsToCents(" 1,000.05 ", any)).toBe(100_005);
    expect(parseDollarsToCents("0", any)).toBe(0);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "$", "25 dollars"]) {
      expect(parseDollarsToCents(bad, any), bad).toBeNull();
    }
  });

  it("respects the limits", () => {
    expect(parseDollarsToCents("0.99", { minCents: 100, maxCents: 500 })).toBeNull();
    expect(parseDollarsToCents("5.01", { minCents: 100, maxCents: 500 })).toBeNull();
    expect(parseDollarsToCents("5", { minCents: 100, maxCents: 500 })).toBe(500);
  });

  it("round-trips with centsToInput", () => {
    for (const cents of [0, 5, 2500, 2550, 15_000]) {
      expect(parseDollarsToCents(centsToInput(cents), any)).toBe(cents);
    }
    expect(centsToInput(2500)).toBe("25");
    expect(centsToInput(2505)).toBe("25.05");
  });
});

describe("inviteUrl", () => {
  it("builds the join link", () => {
    expect(inviteUrl("https://club.example/", "KUBI-4821")).toBe("https://club.example/join/KUBI-4821");
  });
});
