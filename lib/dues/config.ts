// Dues settings (decided Nov 15): $25, once per term.
// To start a new term, change CURRENT_TERM; everyone can pay again.
export const DUES_AMOUNT_CENTS = 2500;

export const CURRENT_TERM = {
  id: "2026-fall", // stored in dues_payments.period
  label: "Fall 2026", // shown to members
} as const;
