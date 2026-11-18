// Page title: the shared one from app/_components/ui.
export { PageHeader } from "../../../_components/ui/PageHeader";

/** A quiet pill link/button for PageHeader's action slot. */
export const headerAction =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-zinc-600 hover:bg-black/5 hover:text-ink";

/**
 * Content widths inside the shell, all centered: member pages stay
 * phone-width, treasurer dashboards go wide (capped so huge screens don't
 * stretch them), and treasurer forms (Budget, Settings) sit in between.
 */
export const memberPage = "mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-5 px-4 pb-12 sm:px-6";
export const treasurerPage = "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-12 sm:px-6 lg:px-8";
export const treasurerFormPage = "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-12 sm:px-6 lg:px-8";
