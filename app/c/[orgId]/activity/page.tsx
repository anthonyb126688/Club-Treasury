"use client";

import { LedgerView } from "@/app/ledger/[orgId]/LedgerView";

// Activity: every dollar in and out of the club, inside the app for
// logged-in members. Same data as the public /ledger/[orgId] page (which
// sponsors open without logging in).
export default function ActivityPage() {
  return <LedgerView embedded />;
}
