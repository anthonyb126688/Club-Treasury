import { Suspense } from "react";
import { LoadingScreen } from "@/app/_components/Mark";
import { LedgerView } from "./LedgerView";

// A club's public ledger. The view reads the club id from the URL, so it
// sits inside <Suspense> (required with cacheComponents).
export default function LedgerPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LedgerView />
    </Suspense>
  );
}
