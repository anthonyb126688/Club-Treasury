// One-time devnet setup. Run with:  node scripts/setup-treasury.mts
//
// 1. Creates the club treasury key (if .env.local doesn't have one) and saves
//    it to .env.local as TREASURY_SECRET_KEY. The secret is never printed.
// 2. Requests free devnet SOL for the treasury so it can pay network fees.
// 3. Creates the club's test-dollar token (6 decimals, like USDC) with the
//    treasury as the only issuer, and saves it as CLUB_DOLLAR_MINT.
//
// Safe to re-run: steps that are already done are skipped. Devnet only.
import { appendFileSync, readFileSync } from "node:fs";
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS,
  getInitializeMint2Instruction,
  getMintSize,
} from "@solana-program/token";

const ENV_FILE = ".env.local";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const PUBLIC_DEVNET = "https://api.devnet.solana.com"; // used only for the SOL airdrop

process.loadEnvFile(ENV_FILE);
const rpcUrl = process.env.HELIUS_DEVNET_RPC_URL;
if (!rpcUrl) throw new Error("HELIUS_DEVNET_RPC_URL is not set in .env.local");
const rpc = createSolanaRpc(rpcUrl);

if ((await rpc.getGenesisHash().send()) !== DEVNET_GENESIS_HASH) {
  throw new Error("HELIUS_DEVNET_RPC_URL is not devnet. Refusing to continue.");
}

function saveEnv(key: string, value: string) {
  const current = readFileSync(ENV_FILE, "utf8");
  const sep = current.endsWith("\n") ? "" : "\n";
  appendFileSync(ENV_FILE, `${sep}${key}=${value}\n`);
}

async function newExtractableKeypairBytes(): Promise<Uint8Array> {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const bytes = new Uint8Array(64);
  bytes.set(pkcs8.slice(-32), 0); // 32-byte private seed
  bytes.set(pub, 32);
  return bytes;
}

async function send(feePayer: KeyPairSigner, instructions: Instruction[]) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const tx = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(feePayer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
  const sig = getSignatureFromTransaction(tx);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64" }).send();
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const s = value[0];
    if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return sig;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${sig}`);
}

// 1. Treasury key
let treasury: KeyPairSigner;
if (process.env.TREASURY_SECRET_KEY) {
  treasury = await createKeyPairSignerFromBytes(
    getBase58Encoder().encode(process.env.TREASURY_SECRET_KEY),
  );
  console.log("Treasury key already in .env.local");
} else {
  const bytes = await newExtractableKeypairBytes();
  treasury = await createKeyPairSignerFromBytes(bytes);
  saveEnv("TREASURY_SECRET_KEY", getBase58Decoder().decode(bytes));
  console.log("Created treasury key and saved it to .env.local");
}
console.log("Treasury address:", treasury.address);

// 2. Devnet SOL for fees
const { value: balance } = await rpc.getBalance(treasury.address).send();
if (balance < lamports(BigInt(200_000_000))) {
  console.log("Requesting 1 devnet SOL for network fees...");
  const res = await fetch(PUBLIC_DEVNET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "requestAirdrop",
      params: [treasury.address, 1_000_000_000],
    }),
  });
  const body = (await res.json()) as { error?: { message: string } };
  if (body.error) {
    console.log(`Airdrop refused (${body.error.message}).`);
    console.log(`Get devnet SOL manually at https://faucet.solana.com for ${treasury.address}, then re-run.`);
    process.exit(1);
  }
  for (let i = 0; i < 30; i++) {
    const { value } = await rpc.getBalance(treasury.address).send();
    if (value >= lamports(BigInt(200_000_000))) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
const { value: sol } = await rpc.getBalance(treasury.address).send();
console.log(`Treasury fee balance: ${Number(sol) / 1e9} devnet SOL`);
if (sol < lamports(BigInt(10_000_000))) {
  console.log(`Not enough devnet SOL yet. Use https://faucet.solana.com for ${treasury.address}, then re-run.`);
  process.exit(1);
}

// 3. Test-dollar token
if (process.env.CLUB_DOLLAR_MINT) {
  console.log("Club dollar token already exists:", process.env.CLUB_DOLLAR_MINT);
} else {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
  const sig = await send(treasury, [
    getCreateAccountInstruction({
      payer: treasury,
      newAccount: mint,
      lamports: rent,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: 6,
      mintAuthority: treasury.address,
      freezeAuthority: null,
    }),
  ]);
  saveEnv("CLUB_DOLLAR_MINT", mint.address);
  console.log("Created club dollar token:", mint.address);
  console.log("Proof:", `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}
