import { redirect } from "next/navigation";
import { DEFAULT_ORG_ID } from "@/lib/orgs/orgs";

// Old link: /ledger → the demo club's public ledger.
export default function LedgerRedirect() {
  redirect(`/ledger/${DEFAULT_ORG_ID}`);
}
