# Club-Treasury

Treasure Chest

A treasury app for student clubs. Members pay dues in one tap, snap a receipt to get reimbursed in seconds, and every dollar shows up on a public ledger. Built solo for the UBC 2026 Hackathon (Consumer Apps track).

Members only ever see dollars. Under the hood, money moves on Solana devnet through a Squads v4 multisig vault for each club.

Features
Clubs: create a club (you become treasurer) or join with a code, invite link or QR
Dues: one-tap payments; each club sets its own amount and period
Reimbursements: AI reads the receipt, then a rules engine pays small in-policy expenses instantly and sends everything else to the treasurer
Treasurer tools: approvals, members, budgets, settings, and an Insights page with charts and CSV export
Public ledger: every inflow and payout, with a Verify link to Solana Explorer
How it's safe
The AI extracts, code decides. Claude only turns a receipt into JSON. Approval logic lives in lib/policy/ as plain, tested TypeScript, and receipt text is treated as untrusted data.
The blockchain caps spending. The server is a propose-only member of each vault and can spend only up to the club's daily limit through a Squads spending limit.
Clubs are isolated. Every club API checks membership or treasurer role and filters by org_id, and tests enforce this.
Stack

Next.js, React, TypeScript, Tailwind, Supabase, Vercel, Privy embedded wallets, Anthropic API, @solana/kit, @sqds/multisig, Vitest

Run it locally
bash
npm install
cp .env.example .env.local   # fill in your own keys
npm run dev

Required environment variables (see .env.example): Privy app ID and secret, Anthropic API key, a devnet RPC URL, the treasury key, Supabase URL and secret key, the club dollar mint, and the Squads addresses. Never commit .env.local.

The database schema lives in supabase/migrations/.

Checks
bash
npm run lint
npm test
npm run build
Notes
Devnet only. No mainnet, no real funds.
Scripts in scripts/ move test dollars on devnet (for example, npm run deposit-starting-funds -- --club=<id> --amount=500). npm run try-overspend shows the blockchain refusing a payment over the daily limit.
Demo Squads vault (devnet): DgiKYPQtyDopFvCrKjXSJFchQP8yag3yyvsPWmo4o225
