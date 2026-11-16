// How the treasurer dashboard groups requests. Each pending request is filed
// under its first reason (see REASON_ORDER in lib/policy/decide.ts).
import { REASON_ORDER, type ReasonCode } from "@/lib/policy/decide";

export type GroupCode = ReasonCode | "payment_problem";

export const GROUP_ORDER: readonly GroupCode[] = ["payment_problem", ...REASON_ORDER];

export const GROUP_TITLES: Record<GroupCode, { title: string; hint: string }> = {
  payment_problem: {
    title: "Payment problems",
    hint: "Approved, but the payout didn't go through.",
  },
  possible_duplicate: {
    title: "Possible duplicates",
    hint: "Compare the two photos before approving.",
  },
  edited_by_member: {
    title: "Edited by member",
    hint: "The member changed what the AI read. Check it against the photo.",
  },
  unreadable: { title: "Hard to read", hint: "The AI couldn't read this one clearly." },
  over_cap: { title: "Over $50", hint: "Too large to pay automatically." },
  over_budget: { title: "Over budget", hint: "Would go over this month's category budget." },
  daily_limit: { title: "Daily limit reached", hint: "The club hit its automatic payout limit for the day." },
  category_not_allowed: {
    title: "Other category",
    hint: "Not a category the club pays automatically.",
  },
  date_problem: { title: "Date problems", hint: "Old, future, or missing receipt date." },
};

export function groupFor(status: string, reviewGroup: string | null): GroupCode {
  if (status === "payment_failed") return "payment_problem";
  return (GROUP_ORDER as readonly string[]).includes(reviewGroup ?? "")
    ? (reviewGroup as GroupCode)
    : "unreadable";
}
