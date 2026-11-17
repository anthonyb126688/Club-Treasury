// Shared Tailwind classes for the onboarding screens (same look as LoginForm):
// black and white frosted glass, like the rest of the app.

export const inputClass =
  "w-full min-h-12 rounded-[12px] border-[0.5px] border-black/10 bg-white/80 px-4 text-[16px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-black/10";

export const primaryButton =
  "inline-flex w-full min-h-12 items-center justify-center rounded-[12px] bg-ink px-4 text-center text-[16px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-40";

export const secondaryButton =
  "glass inline-flex w-full min-h-12 items-center justify-center rounded-[12px] px-4 text-center text-[16px] font-semibold text-ink hover:bg-white/80 disabled:opacity-40";

export const labelClass = "text-[13px] font-medium text-muted";

export const mutedText = "text-muted";

export const errorText = "text-[13px] font-medium text-alert";

export const card = "glass rounded-[16px] p-4 sm:p-5";
