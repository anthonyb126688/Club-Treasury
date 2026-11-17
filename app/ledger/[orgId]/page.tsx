import { Suspense } from "react";
import { LedgerView } from "./LedgerView";

// A club's public ledger. The view reads the club id from the URL, so it
// sits inside <Suspense> (required with cacheComponents).
export default function LedgerPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-md px-4 py-12 text-zinc-600 dark:text-zinc-400">Loading…</p>}>
      <LedgerView />
    </Suspense>
  );
}
