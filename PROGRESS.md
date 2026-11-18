# Redesign + Insights: progress log

The plan is `Redesign.md` (the 7-phase black/white glass + Insights brief).
`Redesign-old-two-phase.md` is an older, wrong plan. Ignore it.

## How to resume (read this first in a new session)
1. Read `CLAUDE.md`, then `Redesign.md`, then this file.
2. `git log --oneline` and `git tag` show the last finished step. The "Status" table below says which phase is next.
3. Work on `main`. Commit after each working step (lint + tests must pass first). Tag at the end of each phase. **Never push, never deploy.**
4. Use the Playwright MCP sparingly (usage is limited): only key pages at 390x844.

## Status
| Phase | Tag | State |
|---|---|---|
| 1 Design system | ui-1-tokens | DONE |
| 2 App shell | ui-2-shell | DONE |
| 3 Restyle every screen | ui-3-pages | DONE |
| 4 Insights backend | insights-4-api | DONE |
| 5 Live data | insights-5-live | DONE |
| 6 Insights page | insights-6-page | DONE |
| 7 Final check | ui-final | DONE |

Priority if usage runs short: 1 → 2 → 3 (what judges see on a phone), then 4 → 5 → 6, then 7.

## Starting point (Nov 17, evening)
- `main` is at `d3e3649` "New app shell" (tag `ui-shell-v1`). It came from the old plan and was **already pushed and deployed** before the no-push rule was known. It has the right-side nav rail, phone tab bar, More sheet, Skip link, shared PageHeader at `app/c/[orgId]/_components/PageHeader.tsx`, an in-shell ledger at `/c/[orgId]/ledger`, `lucide-react@1.68.0`, and `viewportFit: "cover"`. The old Menu dropdown, ClubLinks and treasurer pill tabs are already removed. Phase 2 will restyle and rename this, not start over.
- Branch `redesign-phase-2` (green/gold polish from the old plan) is abandoned. Don't merge it.
- Test club for the demo walk: "Test Club" `eb99716a-6b4c-49f1-a0db-84cee7f15ec3` (the user is its founder/treasurer). Fake receipt images: `.playwright-mcp/receipt-pizza.png`, `receipt-400.png`, `receipt-inject.png`, `receipt-coffee.png`. Real devnet test dollars already moved there today (dues paid, $18 + $10 + $12.50 auto-paid, $400 approved, one duplicate pizza is Blocked).
- The Playwright browser is logged in as the user (a treasurer). Member views can be seen by intercepting `GET /api/me` in Playwright and setting each club's role to "member" (browser only; nothing changes on the server).
- There's a pending join request from the user's `+test` email in Test Club. Leave it for the user (demo step 2).
- Known existing quirk: the overview's waiting count includes possible duplicates, which appear under the Blocked tab, so the Approvals badge can say 1 while "Needs approval" shows 0.

## Plan per phase (what will actually be done)
**Phase 1:** rewrite `app/globals.css`:
- light only, `@custom-variant dark` so `dark:` classes stop applying, no prefers-color-scheme block
- system font; Geist and Bricolage removed from `app/layout.tsx`
- page gray `#e9e9ec`, a `.glass` surface with a solid `#fafafa` fallback
- red, orange and green used only for emphasis
- `zinc-*` remapped to true grays; `brand-*` and `gold-*` pointed at grays and black so old screens don't break
- themeColor set to the light gray
- the blurred gray background shapes added to the root layout

Then build `app/_components/ui/`: GlassCard, Button, PageHeader, StatTile, SegmentedControl, ProgressBar (pace tick), ListRow, Badge, Sheet, EmptyState. Then lint, test, build, commit, tag.

**Phase 2:**
- restyle `AppShell.tsx` into glass
- rename Ledger to Activity (`/c/[orgId]/activity`)
- add Insights to Manage (a placeholder page until Phase 6)
- treasurer phone tabs: Home / Insights / Approvals / Members / More; the More sheet adds Get reimbursed
- the phone tab bar becomes a floating pill; the Approvals badge turns red
- the current page gets the black icon tile highlight

**Phase 3:** one commit per page, in the brief's order. Looks only, no behavior changes.

**Phases 4 to 7:** as written in `Redesign.md`.

## Decisions I made
- Rebuild on top of the existing shell commit instead of reverting it, because most of its structure matches the brief.
- Phase 1: old color names point at the new palette so nothing breaks before restyling:
  - `zinc-*` = true grays
  - `brand-50..400` = light-to-mid grays, `brand-600..950` = black (#0a0a0a / #1c1c1e)
  - `gold-*` = light grays (so the old gold button with black text stays readable)
- New color tokens: `ink` #0a0a0a, `page` #e9e9ec, `alert` #FF3B30, `warn` #FF9500 / `warn-text` #C93400, `income` #248A3D, plus `muted` and `hairline`. Glass is a plain CSS class, `.glass`, with `.glass-strong` for the current nav item; both fall back to solid #fafafa.
- `sheet-up` and `sheet-side` are Tailwind `@utility` entries so `lg:sheet-side` works.
- The old `app/c/[orgId]/_components/PageHeader.tsx` now re-exports the new `app/_components/ui/PageHeader` (it still holds the page-width class strings).
- `lucide-react` is pinned at 1.68.0 (added earlier).
- Phase 2:
  - The in-shell ledger route `/c/[orgId]/ledger` (from the earlier session) was renamed to `/c/[orgId]/activity`. Nothing else linked to the old path.
  - Insights is a placeholder page until Phase 6.
  - The Approvals badge still polls every 60s; Phase 5 makes it live.
  - The More sheet uses the shared `Sheet` (always a bottom sheet).
  - The phone tab bar is a floating glass pill, 12px from the sides, above the home bar.
- Phase 3 Home:
  - The "spent this period" ring adds up every budgeted category's current-period spent and budget from the member budget API (`lib/member/ring.ts`, tested). Months and semesters are mixed, so the label just says "this period".
  - The old `DuesCard` component became a `useDues` hook (same payment steps, unchanged), so "Pay dues" can sit in the balance card. The dues status is its own small card.
  - Recent activity reads `/api/ledger/[orgId]` (the same data as Activity); the row component `ActivityRow` lives in `app/_components/RecentActivity.tsx` and is shared with Activity.
  - On phones under 420px, the Get reimbursed button hides its icon so the text fits on one line.
- Phase 3 Budget (member): the old amber "80% used" color was dropped. The member API has no pace data, and orange is reserved for "ahead of pace". Bars are black, and red only when over budget.
- Phase 3 Approvals: the request detail now opens in the shared `Sheet` (bottom sheet on phones, a slide-in side panel over the page at lg+) instead of the old inline column. The tabs are a `SegmentedControl` with counts (red when something needs approval). The "Waiting for you" tile is red when above 0.
- Phase 3 Members: on phones, each person is a row that opens the shared `Sheet` with their actions. On md+ it's a glass table with inline actions. Join requests are a glass list with black Approve and glass Decline buttons (red when confirming).
- Phase 3 Budget builder and Settings: restyled by mapping the old class strings to the new ones (input, black primary, glass secondary, red danger buttons, glass group sections). No behavior changes.
- Phase 3 onboarding: `app/_components/onboarding/styles.ts` holds the shared classes for /start, /create, /join, /waiting, so changing them restyled all of those. LoginForm and the landing page got the same input/button/card look.
- Login screens were checked in a separate logged-out Playwright browser context, so the user's logged-in session isn't touched.
- The "bigint: Failed to load bindings" lines during `npm run build` are an old, harmless dependency warning; the build exits 0.
- Phase 3 public ledger: the logged-out header is a glass pill with the logo and "Log in" (or "Open the app" when logged in). The page title is "Public ledger" and the in-app title is "Activity".

- Phase 4 decisions:
  - Months are bucketed in America/Chicago (`lib/insights/ranges.ts`).
  - "Semester" uses the app's existing semester rule (Spring Jan–May, Summer Jun–Jul, Fall Aug–Dec, from `lib/dues/period.ts`). That equals the club's dues period when dues are per semester, and is the matching term otherwise. (The brief said Aug–Dec / Jan–May; summer stays Jun–Jul to match the rest of the app.)
  - Range "elapsed share" uses UTC month boundaries; it's off by a few hours at most, which is fine for a pace tick.
  - Spent = SPENT_STATUSES counted by decided_at (same as the overview's budget bars). Per-member spending = status "paid", counted by paid_at.
  - Budget for a range: month budgets × months in the period; semester budgets spread evenly over the semester's months (5, or 2 for summer). Archived categories are left out of budgets and pace, but their past spending still shows in totals.
  - A $0-budget category with any spending counts as "over budget" in pace.
  - Spending by member lists every active member (zeros at the bottom) so the dues marker shows for everyone.
  - Runway uses the number of months in the range so far (including the current month) as the divisor.
  - CSV: formula-looking strings get a leading apostrophe; booleans become Yes/No; UTF-8 BOM; CRLF line endings.
  - CSV dates are Chicago calendar dates (YYYY-MM-DD). The requests export leaves out unsent drafts (status "submitted"). The members export's "Joined" is the approval date (or the request date if missing).
  - Insights "Spent" = spent statuses decided in the range. "Auto-approved share" = the share of those decided by the policy (`decided_by = 'policy'`).
  - The club balance in Insights is read the same way as the overview (`getDollarBalance(clubHolderAddress(org))`). If that fails, `balance` is null and the rest still loads.

- Phase 5 decisions:
  - The public ledger page (`/ledger/[orgId]`, no login) keeps its own 5-second refresh, as decided on Nov 16. The in-app Activity uses `useLiveData` (15s plus the signal). `LedgerView` is split into `ActivityLive`, `PublicLedger` and a shared `LedgerContent`.
  - Animations: ProgressBar widths and the Ring ease over 300ms; new list rows use `fade-in`. Existing rows keep their keys, so they don't re-animate. Reduced motion turns these off (globals.css).

- Phase 6 decisions:
  - `HBarList` (spending by member) uses `role="figure"` instead of `role="img"`, because its rows are links and "img" would hide them from screen readers and keyboards. It still has an aria-label and a hidden table.
  - Chart tooltips are a small black bubble over the touched bar or point. Tap toggles it on phones; hover and keyboard focus show it on desktop.
  - The current month's bar is light gray (unfinished). The dashed budget line is the sum of active categories' monthly budgets.
  - The donut and legend color only categories that are ahead of pace (orange) or over budget (red); everything else is black and grays.
  - "Net" above money in/out is green only when positive.
  - The Home Insights card always shows the semester range.

- Phase 7 decisions:
  - Used the prompt-injection receipt (step 6) for the live-update check, because it moves no money and lands in the treasurer's queue. Denied it with the note "Already paid on Nov 16 — same receipt photo. (Phase 7 test)", so it now shows under Denied in Test Club.
  - Didn't create a new club or pay anything (see Skipped), so no new on-chain activity beyond reading balances.
  - Fixed the "No members yet" wording/placement on Members (the only code change in Phase 7).

## Skipped / reverted
- Demo step 1 (create a club): not re-run. Creating a club sets up a new on-chain vault and adds $1,000 of test dollars, and would leave a junk club. Checked the QR/invite screen in Test Club's Settings instead.
- Demo steps 3, 4 and 5 (pay dues, $18 pizza, $400 approval): not re-run. They move test dollars, dues are already paid this term, and every fake receipt has already been used (a re-send is a duplicate). Their Nov 17 results are still on screen (Paid tab, Activity, Dues paid) and were checked there.
- Member-view screenshots use a browser-only override of `/api/me` (role = member). No real second member account was used.
- Nothing was reverted.

## Log
- Nov 17: wrote this file. Nothing from the new plan built yet.
- Phase 1 done:
  - `globals.css` rewritten (light only, glass, system font, emphasis colors); layout drops Geist and Bricolage and adds the blurred background shapes; themeColor is #e9e9ec.
  - `app/_components/ui/`: GlassCard (+SectionLabel), Button (+ButtonLink, buttonClass), PageHeader, StatTile, SegmentedControl, ProgressBar (pace tick), ListRow (+IconTile, ListGroup), Badge (+CountBadge), Sheet, EmptyState (+ErrorState, LoadingBlocks).
  - lint, tests and build are green. Screenshot: `.playwright-mcp/redesign/p1-home-390.png`.
- Phase 2 done:
  - `AppShell.tsx` rewritten: glass rail (current item = darker glass + black icon tile), black Get reimbursed button, Manage group = Insights / Approvals (red CountBadge) / Members / Settings.
  - Phones: glass top bar; floating pill tab bar (members: Home / Reimburse / Budget / Activity; treasurers: Home / Insights / Approvals / Members / More).
  - New `/c/[orgId]/activity` and a placeholder `/c/[orgId]/treasurer/insights`.
  - lint, tests and build are green. Screenshots: `.playwright-mcp/redesign/p2-*.png`.
  - Note: `npx tsc` shows stale errors about `.next/types` after a route rename until the next build; this is not a real error.
- Phase 3 done (one commit per page): Home; Get reimbursed; Budget (member); Activity + public ledger (one shared component, `LedgerView`); Approvals; Members; Budget builder; Settings; Login + onboarding. Nothing scrolls sideways at 390px (checked with scrollWidth). Build green. Tag `ui-3-pages`.
- Phase 4 so far: `lib/insights/` ranges, spending, pace, cashflow, byMember, vendors, csv, with 7 test files (34 tests, all green).
- Phase 4 done:
  - `lib/insights/types.ts` (the response shape) and `lib/insights/load.ts` (server-only loader: 5 queries + balance, all `.eq("org_id", orgId)`; the `members` lookup is by person id, like the overview).
  - Routes: `GET app/api/orgs/[orgId]/treasurer/insights` and `.../treasurer/export` (both `requireTreasurer`, already covered by the "treasurer" folder in route-guards).
  - `tests/org-isolation.test.ts` gained a treasurer of Club A ("trish") who is refused Club B, plus a check that every Insights/export query filters by the requested club.
  - Checked live against Test Club: 200 with real numbers, CSV download with the right file name, and 404 for an unknown club.
- Phase 5 done:
  - `app/_components/useLiveData.ts` provides `useLiveData(url, { intervalMs })`, `signalDataChanged()` and `useOnDataChanged(fn)`. The pure state rules live in `lib/live/state.ts` (tested in `tests/live-state.test.ts`: keep the last good data, error only after 2 failures in a row, plus the "Updated just now / N min ago" label).
  - The hook polls only while the tab is visible, refetches on tab return or window focus, and refetches on the signal. The signal is a window event plus `BroadcastChannel("club-data")`, so other tabs follow. A refresh asked for while one is already running runs once more right after it.
  - The signal fires after: dues paid (`useDues`), a receipt sent (reimburse page), and approve / deny / retry (Approvals `run()`). Only client success handlers were changed; no server routes.
  - Uses the hook (10s): the Approvals badge (AppShell) and the Approvals tiles. The request list polls every 10s and follows the signal.
  - Uses the hook (15s): Home balance, the budget ring and Recent activity, and Activity. Club balance and dues (`useDues`) and My requests refresh on the signal.
  - Checked live: firing the signal on Approvals made 3 refetches (badge, tiles, list) with no console errors.
- Phase 6 done:
  - Charts in `app/_components/charts/` (BarChart, LineChart, Donut, PairedBars, HBarList, plus `common.tsx` and the Ring from Phase 3). No charting library. Each has an aria-label, a hidden data table, a tap/hover tooltip with the exact dollar amount, and an empty state.
  - Insights page `/c/[orgId]/treasurer/insights`: Month/Semester/Year in the URL (`?range=`), an Export sheet (Activity / Requests / Members CSV for the range), 4 tiles, then spending by month, pace, by category, money in vs out, by member, top vendors. Phones stack in the brief's order; lg+ pairs them up.
  - Tapping a member opens `/treasurer/members?person=<id>`, and the Members page opens that person's sheet.
  - Home: the treasurer-only Insights card (semester spending line + the top alert) sits under the balance card.
  - Checked at 390 and 1440 with real Test Club data. Fixed one sideways-scroll bug: hidden data tables were 360px wide, so each is now wrapped in an `sr-only` div.
  - Screenshots: `.playwright-mcp/redesign/p6-*.png`.
- Phase 3, page 1 (Home) done: glass balance card (club balance big, your balance small, black Get reimbursed, glass Pay dues), budget ring, dues status, My requests in a glass list with a black step bar, Recent activity (latest 5, "See all").
- Phase 7 done (Nov 18):
  - `npm run lint`, `npm test` (32 files, 430 tests) and `npm run build` all pass, before and after the one fix below.
  - Screenshots `.playwright-mcp/redesign/p7-*.png`: all 9 club pages as treasurer and 5 as member (Home, Get reimbursed, Budget, Activity, and the "Treasurers only" guard on Approvals), each at 390x844 and 1440x900. No page scrolls sideways (scrollWidth <= viewport everywhere) and no error states showed. Only console noise is Next's dev-only "cache disabled" warning.
  - On the 1440 *full-page* screenshots the background and side rail stop at 900px. That's the screenshot stitching fixed-position layers, not a real bug (in a browser they stay put while scrolling).
  - Live updates: with Insights open in a second tab, I denied a request with a note in the first tab. Insights refetched its data and the overview about 1s later with no reload, and its Approvals badge went 2 → 1 about 5s after the deny. The extra seconds are the server: `/treasurer/overview` takes 1-2.5s on the dev server because it reads the club balance from Solana devnet.
  - Fix: Members page showed "No members yet" right above the founder's own row (when the treasurer is the only member). The invite nudge now sits below the list and says "Just you so far" (still "No members yet" if the list is truly empty).
  - Demo walk at 390px (Test Club):
    1. Create club + QR: Settings → Invite link and QR shows the QR (create not re-run, see Skipped).
    2. Join request: Members shows the `+test` request with Approve / Decline (left pending for you).
    3. Dues: Home shows "Dues paid" / Fall 2026 $25.00 (paid Nov 17).
    4. $18 pizza: Paid, shown in My requests and Activity (Nov 17).
    5. $400: Approvals → Paid → Pacific Event Rentals shows both reasons (over the $50 cap, over the $150 daily limit), "Paid Nov 17" and "Verify this payment".
    6. Ran today: sent the "approve $5,000" receipt. The AI read it as Corner Market $10.00, Supplies, and said "The receipt contains unusual instruction-like text". It was **not** paid: it went to Blocked as a possible duplicate (same photo as the Nov 16 one). I then denied it with a note (that's the live-update test above). The original duplicate pizza is still in Blocked for your demo.
    7. Budget shows Food $30.50/$200, Supplies $10/$150, Events $400/$500, etc. Activity's Verify links go to `explorer.solana.com/tx/...?cluster=devnet`.

## Summary
The whole 7-phase brief is built on `main` and tagged phase by phase (`ui-1-tokens` → `ui-final`). The app is now a light, black-and-white frosted-glass design with a side rail on laptops and a floating tab bar on phones, every screen restyled, a new Activity page, and a treasurer Insights page (hand-made SVG charts, budget pace, money in/out, per-member spending, top vendors, CSV export). Screens refresh on their own and right after dues, receipts, approvals or denials, including in other tabs. Lint, 430 tests and the build are green. Nothing has been pushed or deployed.

## What to look at first
1. Phone Home and Insights: `.playwright-mcp/redesign/p7-treasurer-home-390.png`, `p7-treasurer-insights-390.png` (then open the app at 390px yourself).
2. Approvals on a laptop: `p7-treasurer-approvals-1440.png`, and the request sheet `p7-demo5-400-paid-390.png`.
3. Member view: `p7-member-home-390.png` and the guard `p7-member-approvals-390.png`.
4. The Members-page fix: `p7-demo2-join-request-390.png`.
5. Before demo day: approve the pending `+test` join request (step 2), and pick a fresh account or club for step 3 (dues are already paid in Test Club). Every fake receipt is now used once, so step 4 needs a new $18 receipt photo (or a new club, where the pizza isn't a duplicate).
6. When you're happy: push `main` and redeploy (I didn't).

## Reset for testing (Nov 18, afternoon)
- Deleted "Test Club" and "Test2" (their leftover test dollars stay in their old vaults on devnet; nobody can reach them from the app).
- "Club Treasury Demo" is a clean slate: only the founder (anthonyb@ku.edu) is a member; the co-treasurer was removed through the Members page, so they're also off the vault on-chain. All requests, dues payments and receipt photos are gone; the ledger keeps only the original "Starting club funds +$1,000". Join code is still CLUB-2026.
- Club vault and the founder's own balance were topped up to exactly $1,000.00 with new test dollars (no ledger rows for the top-ups).
- Everyone else's `last_org_id` was cleared, so they land on "Create or join a club" after login. A backup of every deleted row is in the session scratchpad (`reset-backup-nov18.json`).
