import { describe, expect, it } from "vitest";
import {
  buildMemberList,
  checkMemberAction,
  parseUserIdParam,
  personName,
  totalsByPerson,
  type MembershipRow,
} from "@/lib/members/rules";

const ME = "did:privy:me";
const CO = "did:privy:co";
const ADA = "did:privy:ada";

const row = (id: string, over: Partial<MembershipRow> = {}): MembershipRow => ({
  privy_user_id: id,
  role: "member",
  status: "active",
  requested_at: "2026-11-01T00:00:00Z",
  member: { email: `${id.slice(10)}@x.edu`, first_name: null, last_name: null },
  ...over,
});

describe("parseUserIdParam", () => {
  it("accepts a Privy id, encoded or not", () => {
    expect(parseUserIdParam("did:privy:abc123")).toBe("did:privy:abc123");
    expect(parseUserIdParam(encodeURIComponent("did:privy:abc123"))).toBe("did:privy:abc123");
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "did:privy:", "did:privy:a b", "did:privy:x'; drop", "did:other:abc", "%E0%A4%A"]) {
      expect(parseUserIdParam(bad)).toBeNull();
    }
  });
});

describe("checkMemberAction", () => {
  const ctx = (targetId: string, treasurers = [ME]) => ({ viewerId: ME, targetId, activeTreasurerIds: treasurers });
  const pending = { role: "member" as const, status: "pending" as const };
  const member = { role: "member" as const, status: "active" as const };
  const treasurer = { role: "treasurer" as const, status: "active" as const };

  it("approves and declines only pending requests", () => {
    expect(checkMemberAction("approve", pending, ctx(ADA)).ok).toBe(true);
    expect(checkMemberAction("decline", pending, ctx(ADA)).ok).toBe(true);
    expect(checkMemberAction("approve", member, ctx(ADA))).toMatchObject({ ok: false, error: "already_handled" });
  });

  it("treats unknown, removed, and declined people as not in the club", () => {
    for (const t of [null, { role: "member" as const, status: "removed" as const }, { role: "member" as const, status: "declined" as const }]) {
      for (const a of ["approve", "remove", "promote", "demote"] as const) {
        expect(checkMemberAction(a, t, ctx(ADA))).toMatchObject({ ok: false, error: "not_found" });
      }
    }
  });

  it("only acts on active members for remove / promote / demote", () => {
    for (const a of ["remove", "promote", "demote", "demote_remove"] as const) {
      expect(checkMemberAction(a, pending, ctx(ADA))).toMatchObject({ ok: false, error: "not_active" });
    }
  });

  it("removes regular members, but treasurers go through the vault flow", () => {
    expect(checkMemberAction("remove", member, ctx(ADA)).ok).toBe(true);
    expect(checkMemberAction("remove", treasurer, ctx(CO, [ME, CO]))).toMatchObject({ ok: false, error: "is_treasurer" });
  });

  it("promotes members only", () => {
    expect(checkMemberAction("promote", member, ctx(ADA)).ok).toBe(true);
    expect(checkMemberAction("promote", treasurer, ctx(CO, [ME, CO]))).toMatchObject({ ok: false, error: "already_treasurer" });
  });

  it("never leaves the club without a treasurer", () => {
    expect(checkMemberAction("demote", treasurer, ctx(ME, [ME]))).toMatchObject({ ok: false, error: "last_treasurer" });
    expect(checkMemberAction("demote", member, ctx(ADA))).toMatchObject({ ok: false, error: "not_treasurer" });
  });

  it("lets a treasurer step down when another treasurer exists", () => {
    expect(checkMemberAction("demote", treasurer, ctx(ME, [ME, CO])).ok).toBe(true);
    expect(checkMemberAction("demote", treasurer, ctx(CO, [ME, CO])).ok).toBe(true);
    expect(checkMemberAction("demote_remove", treasurer, ctx(CO, [ME, CO])).ok).toBe(true);
  });

  it("doesn't let a treasurer remove themselves here (that's Leave club)", () => {
    expect(checkMemberAction("demote_remove", treasurer, ctx(ME, [ME, CO]))).toMatchObject({ ok: false, error: "remove_self" });
    expect(checkMemberAction("remove", { role: "member", status: "active" }, ctx(ME))).toMatchObject({ ok: false, error: "remove_self" });
  });

  it("doesn't let a co-treasurer demote or remove the club's founder", () => {
    // ME founded the club; CO is a co-treasurer looking at ME.
    const asCo = { viewerId: CO, targetId: ME, activeTreasurerIds: [ME, CO], founderId: ME };
    expect(checkMemberAction("demote", treasurer, asCo)).toMatchObject({ ok: false, error: "founder" });
    expect(checkMemberAction("demote_remove", treasurer, asCo)).toMatchObject({ ok: false, error: "founder" });
    // Even if the founder stepped down earlier, a co-treasurer can't remove them.
    expect(checkMemberAction("remove", member, asCo)).toMatchObject({ ok: false, error: "founder" });
  });

  it("still lets the founder step down, and manage co-treasurers", () => {
    const founder = { activeTreasurerIds: [ME, CO], founderId: ME };
    expect(checkMemberAction("demote", treasurer, { ...founder, viewerId: ME, targetId: ME }).ok).toBe(true);
    expect(checkMemberAction("demote", treasurer, { ...founder, viewerId: ME, targetId: CO }).ok).toBe(true);
    expect(checkMemberAction("demote_remove", treasurer, { ...founder, viewerId: ME, targetId: CO }).ok).toBe(true);
  });

  it("explains every refusal in plain English", () => {
    const r = checkMemberAction("demote", treasurer, ctx(ME, [ME]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/at least one treasurer/);
  });
});

describe("member list", () => {
  it("names people by first/last name, else email, else 'A member'", () => {
    expect(personName({ email: "a@x.edu", first_name: "Ada", last_name: "Lovelace" })).toBe("Ada Lovelace");
    expect(personName({ email: "a@x.edu", first_name: null, last_name: null })).toBe("a@x.edu");
    expect(personName(null)).toBe("A member");
  });

  it("adds up paid reimbursements per person", () => {
    const totals = totalsByPerson([
      { privy_user_id: ADA, total_cents: 1800 },
      { privy_user_id: ADA, total_cents: 40000 },
      { privy_user_id: CO, total_cents: null },
    ]);
    expect(totals.get(ADA)).toBe(41800);
    expect(totals.get(CO)).toBe(0);
  });

  it("puts pending first (oldest first), then treasurers, then members by name; hides removed/declined", () => {
    const list = buildMemberList(
      [
        row("did:privy:zed", { member: { email: null, first_name: "Zed", last_name: null } }),
        row("did:privy:late", { status: "pending", requested_at: "2026-11-10T00:00:00Z" }),
        row(ME, { role: "treasurer" }),
        row("did:privy:amy", { member: { email: null, first_name: "amy", last_name: null } }),
        row("did:privy:early", { status: "pending", requested_at: "2026-11-02T00:00:00Z" }),
        row("did:privy:gone", { status: "removed" }),
        row("did:privy:no", { status: "declined" }),
      ],
      new Set(),
      new Map(),
      ME,
    );
    expect(list.map((p) => p.userId)).toEqual([
      "did:privy:early",
      "did:privy:late",
      ME,
      "did:privy:amy",
      "did:privy:zed",
    ]);
    expect(list.find((p) => p.userId === ME)?.isYou).toBe(true);
  });

  it("shows dues paid only for active members, and reimbursed totals", () => {
    const list = buildMemberList(
      [row(ADA), row(CO), row("did:privy:p", { status: "pending" })],
      new Set([ADA, "did:privy:p"]),
      new Map([[ADA, 1800]]),
      ME,
    );
    const byId = Object.fromEntries(list.map((p) => [p.userId, p]));
    expect(byId[ADA]).toMatchObject({ duesPaidThisPeriod: true, totalReimbursedCents: 1800 });
    expect(byId[CO]).toMatchObject({ duesPaidThisPeriod: false, totalReimbursedCents: 0 });
    expect(byId["did:privy:p"].duesPaidThisPeriod).toBe(false);
  });
});
