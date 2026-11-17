import { describe, expect, it } from "vitest";
import { currentPeriod, perPeriod } from "@/lib/dues/period";
import { decideAccess, wouldLeaveNoTreasurer, type Membership } from "@/lib/orgs/decide-access";
import { JOIN_CODE_PATTERN, makeJoinCode, normalizeJoinCode } from "@/lib/orgs/join-code";
import { slugify } from "@/lib/policy/rules";

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ALICE = "did:privy:alice";
const BOB = "did:privy:bob";

const member = (over: Partial<Membership> = {}): Membership => ({
  org_id: CLUB_A,
  privy_user_id: ALICE,
  role: "member",
  status: "active",
  ...over,
});

describe("decideAccess", () => {
  it("lets an active member in as a member", () => {
    expect(decideAccess(member(), CLUB_A, ALICE, "member")).toBe("ok");
  });

  it("a regular member can't do treasurer actions", () => {
    expect(decideAccess(member(), CLUB_A, ALICE, "treasurer")).toBe("not_treasurer");
  });

  it("a treasurer can do both", () => {
    const t = member({ role: "treasurer" });
    expect(decideAccess(t, CLUB_A, ALICE, "member")).toBe("ok");
    expect(decideAccess(t, CLUB_A, ALICE, "treasurer")).toBe("ok");
  });

  it("Club A's membership never opens Club B", () => {
    expect(decideAccess(member({ role: "treasurer" }), CLUB_B, ALICE, "member")).toBe("not_member");
  });

  it("someone else's membership never counts", () => {
    expect(decideAccess(member(), CLUB_A, BOB, "member")).toBe("not_member");
  });

  it("no membership, removed, or declined → not a member", () => {
    expect(decideAccess(null, CLUB_A, ALICE, "member")).toBe("not_member");
    expect(decideAccess(member({ status: "removed" }), CLUB_A, ALICE, "member")).toBe("not_member");
    expect(decideAccess(member({ status: "declined" }), CLUB_A, ALICE, "member")).toBe("not_member");
  });

  it("a removed treasurer loses treasurer powers", () => {
    expect(decideAccess(member({ role: "treasurer", status: "removed" }), CLUB_A, ALICE, "treasurer")).toBe(
      "not_member",
    );
  });

  it("waiting for approval → pending, with no access yet", () => {
    expect(decideAccess(member({ status: "pending" }), CLUB_A, ALICE, "member")).toBe("pending");
  });
});

describe("wouldLeaveNoTreasurer", () => {
  it("blocks the only treasurer from leaving", () => {
    expect(wouldLeaveNoTreasurer([ALICE], ALICE)).toBe(true);
  });
  it("allows it when there's another treasurer", () => {
    expect(wouldLeaveNoTreasurer([ALICE, BOB], ALICE)).toBe(false);
  });
});

describe("join codes", () => {
  const fixed = () => 0.4821;

  it("uses the first 4 letters of the club name + 4 digits", () => {
    expect(makeJoinCode("KU Biology Club", fixed)).toBe("KUBI-4821");
  });

  it("pads short names with letters", () => {
    expect(makeJoinCode("A1", fixed)).toMatch(JOIN_CODE_PATTERN);
  });

  it("always matches the format", () => {
    for (let i = 0; i < 50; i++) expect(makeJoinCode("Chess Club")).toMatch(JOIN_CODE_PATTERN);
  });

  it.each([
    ["kubi-4821", "KUBI-4821"],
    [" KUBI 4821 ", "KUBI-4821"],
    ["kubi4821", "KUBI-4821"],
  ])("normalizes %j", (input, code) => {
    expect(normalizeJoinCode(input)).toBe(code);
  });

  it.each(["", "KUB-4821", "KUBI-482", "1234-ABCD"])("rejects %j", (input) => {
    expect(normalizeJoinCode(input)).toBeNull();
  });
});

describe("periods", () => {
  it("semesters", () => {
    expect(currentPeriod("semester", new Date("2026-11-16T12:00:00Z"))).toEqual({
      id: "2026-fall",
      label: "Fall 2026",
      startsOn: "2026-08-01",
    });
    expect(currentPeriod("semester", new Date("2026-02-01T00:00:00Z")).id).toBe("2026-spring");
    expect(currentPeriod("semester", new Date("2026-06-15T00:00:00Z")).id).toBe("2026-summer");
  });

  it("months", () => {
    expect(currentPeriod("month", new Date("2026-11-16T12:00:00Z"))).toEqual({
      id: "2026-11",
      label: "November 2026",
      startsOn: "2026-11-01",
    });
  });

  it("phrases", () => {
    expect(perPeriod("month")).toBe("per month");
    expect(perPeriod("semester")).toBe("per semester");
  });
});

describe("slugify", () => {
  it("turns names into category ids", () => {
    expect(slugify("Club T-shirts!")).toBe("club-t-shirts");
    expect(slugify("  Food & Drinks ")).toBe("food-drinks");
  });
});
