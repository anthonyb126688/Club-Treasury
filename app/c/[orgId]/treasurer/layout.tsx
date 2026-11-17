import type { ReactNode } from "react";
import { TreasurerArea } from "./_components/TreasurerArea";

// Every treasurer page (approvals, members, budget, settings) shows a
// friendly message to anyone who isn't this club's treasurer. The server
// checks treasurer access again on every API call.
export default function TreasurerLayout({ children }: { children: ReactNode }) {
  return <TreasurerArea>{children}</TreasurerArea>;
}
