// Club join codes, like a Canvas course code: 4 letters from the club's name
// + 4 digits, e.g. "KUBI-4821". Pure, tested in tests/orgs.test.ts.

export const JOIN_CODE_PATTERN = /^[A-Z]{4}-[0-9]{4}$/;

/** Make a join code from the club name. `random` is injectable for tests. */
export function makeJoinCode(clubName: string, random: () => number = Math.random): string {
  const letters = clubName.toUpperCase().replace(/[^A-Z]/g, "");
  let prefix = letters.slice(0, 4);
  while (prefix.length < 4) prefix += String.fromCharCode(65 + Math.floor(random() * 26));
  const digits = String(Math.floor(random() * 10_000)).padStart(4, "0");
  return `${prefix}-${digits}`;
}

/** Tidy what someone typed: " kubi 4821 " → "KUBI-4821". Null if it can't be a code. */
export function normalizeJoinCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}[0-9]{4}$/.test(cleaned)) return null;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
