// What a live-updating screen shows while it refreshes. Pure, tested in
// tests/live-state.test.ts.
//
// Rules: keep showing the last good data while a refresh runs or fails, and
// only report an error after two failures in a row.

export type LiveState<T> = {
  data: T | null;
  failures: number; // failures in a row since the last success
  updatedAt: number | null; // ms timestamp of the last good data
};

export const ERROR_AFTER_FAILURES = 2;

export function initialLiveState<T>(): LiveState<T> {
  return { data: null, failures: 0, updatedAt: null };
}

export function onSuccess<T>(_prev: LiveState<T>, data: T, at: number): LiveState<T> {
  return { data, failures: 0, updatedAt: at };
}

export function onFailure<T>(prev: LiveState<T>): LiveState<T> {
  return { ...prev, failures: prev.failures + 1 };
}

export function hasError(state: LiveState<unknown>): boolean {
  return state.failures >= ERROR_AFTER_FAILURES;
}

/** "Updated just now" / "Updated 2 min ago" / "Updated 1 hr ago". */
export function updatedLabel(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return "";
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 45) return "Updated just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `Updated ${hours} hr ago`;
}
