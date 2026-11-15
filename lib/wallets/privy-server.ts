import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Server-side Privy helpers. PRIVY_APP_SECRET must never reach the browser.

function appId(): string {
  const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!id) throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set");
  return id;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Check a Privy access token and return the Privy user id, or null if invalid. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  jwks ??= createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${appId()}/jwks.json`),
  );
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "privy.io",
      audience: appId(),
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

type LinkedAccount = {
  type: string;
  address?: string;
  chain_type?: string;
  connector_type?: string;
};

export type Member = {
  email: string | null;
  /** Solana address of the member's Privy-created account, once it exists. */
  solanaAddress: string | null;
};

/** Look up a member's email and Solana address from Privy. */
export async function getMember(userId: string): Promise<Member> {
  const secret = process.env.PRIVY_APP_SECRET;
  if (!secret) throw new Error("PRIVY_APP_SECRET is not set");

  const res = await fetch(
    `https://api.privy.io/v1/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${appId()}:${secret}`).toString("base64")}`,
        "privy-app-id": appId(),
      },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Privy user lookup failed (${res.status})`);

  const user = (await res.json()) as { linked_accounts?: LinkedAccount[] };
  const accounts = user.linked_accounts ?? [];
  const email = accounts.find((a) => a.type === "email")?.address ?? null;
  const solanaAddress =
    accounts.find(
      (a) =>
        a.type === "wallet" &&
        a.chain_type === "solana" &&
        a.connector_type === "embedded",
    )?.address ?? null;

  return { email, solanaAddress };
}
