// Page title: the shared one from app/_components/ui.
export { PageHeader } from "../../../_components/ui/PageHeader";

/** A quiet pill link/button for PageHeader's action slot. */
export const headerAction =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-zinc-600 hover:bg-black/5 hover:text-ink";

/** Content widths inside the shell: member pages stay phone-width, treasurer pages use the whole area. */
export const memberPage = "mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-5 px-4 pb-12 sm:px-6";
export const treasurerPage = "flex w-full flex-1 flex-col gap-6 px-4 pb-12 sm:px-6 lg:px-8";
