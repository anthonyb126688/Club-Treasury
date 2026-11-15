import { address, type Address } from "@solana/kit";

// The token members' dollars are held in. For now this is the club's own
// devnet test-dollar token (created by scripts/setup-treasury.mts), because
// Circle's faucet only gives 20 USDC every 2 hours. To switch to real devnet
// USDC later, set CLUB_DOLLAR_MINT to USDC_DEVNET_MINT. Both use 6 decimals.
export const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const DOLLAR_DECIMALS = 6;

export function getDollarMint(): Address {
  const mint = process.env.CLUB_DOLLAR_MINT;
  if (!mint) throw new Error("CLUB_DOLLAR_MINT is not set");
  return address(mint);
}
