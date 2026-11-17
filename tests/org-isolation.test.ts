import { beforeEach, describe, expect, it, vi } from "vitest";

// Club isolation, end to end through the real gatekeeper and loaders, with a
// fake database that records every filter. Proves:
//   * a member of Club A can't get into Club B (and can't be a treasurer
//     of A without the role)
//   * lookups always filter by the requested club's id

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ALICE = "did:privy:alice"; // active member of Club A only
const PAT = "did:privy:pat"; // asked to join Club A, not approved yet

type Filter = { op: string; args: unknown[] };
type Query = { table: string; filters: Filter[] };
const queries: Query[] = [];

const memberships = [
  { org_id: CLUB_A, privy_user_id: ALICE, role: "member", status: "active" },
  { org_id: CLUB_A, privy_user_id: PAT, role: "member", status: "pending" },
];

function eqValue(q: Query, col: string) {
  return q.filters.find((f) => f.op === "eq" && f.args[0] === col)?.args[1];
}

function answer(q: Query): { data: unknown; error: null } {
  if (q.table === "members") {
    const id = eqValue(q, "privy_user_id");
    return { data: id ? { email: `${id}@x.edu`, solana_address: "Addr111", first_name: null, last_name: null, last_org_id: null } : null, error: null };
  }
  if (q.table === "orgs") {
    const id = eqValue(q, "id");
    return { data: id === CLUB_A || id === CLUB_B ? { id, name: "Club", school: "", join_code: "CLUB-0001", vault_status: "ready" } : null, error: null };
  }
  if (q.table === "org_memberships") {
    const org = eqValue(q, "org_id");
    const user = eqValue(q, "privy_user_id");
    return { data: memberships.find((m) => m.org_id === org && m.privy_user_id === user) ?? null, error: null };
  }
  return { data: null, error: null };
}

function builder(table: string) {
  const q: Query = { table, filters: [] };
  queries.push(q);
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "neq", "in", "is", "gte", "or", "order", "limit", "insert", "update", "upsert"]) {
    chain[op] = (...args: unknown[]) => {
      q.filters.push({ op, args });
      return chain;
    };
  }
  chain.maybeSingle = async () => answer(q);
  chain.single = async () => answer(q);
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    const result = answer(q);
    return Promise.resolve({ ...result, data: Array.isArray(result.data) ? result.data : [] }).then(resolve, reject);
  };
  return chain;
}

vi.mock("@/lib/db", () => ({ db: () => ({ from: builder }) }));
vi.mock("@/lib/wallets/privy-server", () => ({
  verifyAccessToken: async (token: string) => (token === "alice" ? ALICE : token === "pat" ? PAT : null),
}));

const { requireMember, requireTreasurer } = await import("@/lib/orgs/access");
const { loadLedger } = await import("@/lib/ledger/load");
const { loadPolicyContext, payOut } = await import("@/lib/reimburse/server");

const as = (token?: string) =>
  new Request("http://test/api", token ? { headers: { authorization: `Bearer ${token}` } } : {});

async function errorOf(result: unknown) {
  expect(result).toBeInstanceOf(Response);
  const res = result as Response;
  return { status: res.status, error: ((await res.json()) as { error: string }).error };
}

beforeEach(() => {
  queries.length = 0;
});

describe("the club gatekeeper", () => {
  it("lets Alice into her own club", async () => {
    const access = await requireMember(as("alice"), CLUB_A);
    expect(access).not.toBeInstanceOf(Response);
    expect((access as { org: { id: string } }).org.id).toBe(CLUB_A);
  });

  it("keeps Alice out of Club B", async () => {
    expect(await errorOf(await requireMember(as("alice"), CLUB_B))).toEqual({ status: 403, error: "not_member" });
  });

  it("a regular member can't call treasurer actions", async () => {
    expect(await errorOf(await requireTreasurer(as("alice"), CLUB_A))).toEqual({
      status: 403,
      error: "not_treasurer",
    });
  });

  it("someone waiting for approval gets nothing yet", async () => {
    expect(await errorOf(await requireMember(as("pat"), CLUB_A))).toEqual({ status: 403, error: "pending" });
  });

  it("no login → 401; unknown club → 404", async () => {
    expect((await errorOf(await requireMember(as(), CLUB_A))).status).toBe(401);
    expect((await errorOf(await requireMember(as("alice"), "not-a-uuid"))).status).toBe(404);
  });
});

describe("lookups always filter by the requested club", () => {
  const filteredBy = (table: string, orgId: string) =>
    queries
      .filter((q) => q.table === table)
      .every((q) => q.filters.some((f) => f.op === "eq" && f.args[0] === "org_id" && f.args[1] === orgId));

  it("the ledger", async () => {
    await loadLedger(CLUB_B, false);
    expect(queries.some((q) => q.table === "ledger_entries")).toBe(true);
    expect(filteredBy("ledger_entries", CLUB_B)).toBe(true);
  });

  it("the policy's spending totals and duplicate check", async () => {
    await loadPolicyContext({
      orgId: CLUB_B,
      requestId: "11111111-1111-4111-8111-111111111111",
      category: { slug: "food", name: "Food", budgetCents: 20_000, period: "month" },
      imageHash: "abc123",
      dedupeKey: "pizza|2026-11-14|1800",
      today: "2026-11-16",
      memberEdited: { amount: false, category: false },
    });
    expect(queries.filter((q) => q.table === "reimbursement_requests")).toHaveLength(3);
    expect(filteredBy("reimbursement_requests", CLUB_B)).toBe(true);
  });

  it("payouts only find requests in the requested club", async () => {
    expect(await payOut(CLUB_B, "11111111-1111-4111-8111-111111111111")).toBe("not_payable");
    expect(filteredBy("reimbursement_requests", CLUB_B)).toBe(true);
  });
});
