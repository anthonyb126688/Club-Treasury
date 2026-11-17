"use client";

import { LedgerView } from "@/app/ledger/[orgId]/LedgerView";

// The club's ledger inside the app, for logged-in members. Same view as
// the public /ledger/[orgId] page (which sponsors open without logging in).
export default function ClubLedgerPage() {
  return <LedgerView embedded />;
}
