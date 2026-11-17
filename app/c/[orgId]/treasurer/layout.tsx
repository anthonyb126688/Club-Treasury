import type { ReactNode } from "react";
import { TreasurerArea } from "./_components/TreasurerArea";

// Every treasurer page (dashboard, members, budget, settings): a shared nav,
// and a friendly message for anyone who isn't this club's treasurer. The
// server checks treasurer access again on every API call.
export default function TreasurerLayout({ children }: { children: ReactNode }) {
  return <TreasurerArea>{children}</TreasurerArea>;
}
