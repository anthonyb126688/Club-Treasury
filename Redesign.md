Club Treasury: dashboard redesign + Insights (autonomous run)

You are working alone for the whole day on the Club Treasury app in this repo. I will not be watching, so do not stop to ask me questions. Read this whole prompt first, then work through the phases in order.

0. Ground rules for this run
How to work unattended
Read CLAUDE.md first and follow it. It has the consumer UX rules, banned words, security rules and the Next.js docs note (read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code). One exception for this run only: CLAUDE.md says "ask instead of guessing". Today, don't ask. Pick the simplest option that fits CLAUDE.md and this prompt, then write it down under "Decisions I made" in PROGRESS.md.
Keep PROGRESS.md at the repo root as your running log. For each phase, record what you did, what you decided, what you skipped and why, and any problems. I'll read it when I'm back.
Commit to main after every working step, with plain-English messages. Do NOT push and do NOT deploy. I'll review and push myself.
Tag a checkpoint at the end of each phase (the names are listed below). If a phase can't be made to work, revert that phase's commits back to the last tag with git revert (never git reset --hard), note it in PROGRESS.md, and move on to the next phase you can still do.
Before every commit, run npm run lint and npm test. At the end of each phase, also run npm run build. Don't commit red. If a test fails because of your change, fix your change, not the test. The only exception is a UI test whose expected markup legitimately changed; in that case explain it in PROGRESS.md.
If you get stuck on one item for more than about 30 minutes, write it down, skip it and keep going.
Do not touch (money and safety code)
lib/solana/, lib/policy/, lib/extract/, lib/reimburse/server.ts, lib/orgs/vault.ts, lib/members/vault-flow.ts, and every API route that prepares, approves, submits, pays or retries (approve/, decide/, dues/, reimburse/, vault/, settings/daily-limit/, members/*/promote|demote/).
Don't run any script in scripts/ (they move test dollars).
No database schema changes. Every number in this prompt can be computed from existing tables. If you truly can't avoid one, write an additive migration file, don't apply it, and explain it in PROGRESS.md.
Never create fake ledger entries or requests to make charts look full. Charts must show real data or a clean empty state.
Keep these rules
The CLAUDE.md consumer UX rules stay: dollars only, and none of the banned words. tests/banned-words.test.ts must keep passing, so CSV headers and labels also avoid them (for example, use "Verify link", not "signature" or "transaction").
Club isolation: every new club API goes under app/api/orgs/[orgId]/, starts with requireMember or requireTreasurer, and filters every query with .eq("org_id", orgId). Everything new in this prompt is treasurer-only, so put it under app/api/orgs/[orgId]/treasurer/. tests/route-guards.test.ts already enforces this.
Receipt-derived text (vendor names, line items) is untrusted. Render it as plain text only.
Design direction (applies to everything)

The look is clean, current-iOS, black and white with frosted glass. Color only marks something that needs attention.

Palette: black (#0a0a0a), white, and grays. The page background is light gray (#e9e9ec) with a few large, soft, blurred gray shapes fixed behind the content, so the glass has something to frost.
Glass surfaces: cards, the nav rail, the top bar, the tab bar and sheets use background: rgba(255,255,255,.55), backdrop-filter: blur(22px) saturate(160%), a 0.5px white border at about 85% opacity, a 1px inset top highlight and a very faint shadow. Add an @supports not (backdrop-filter: blur(1px)) fallback using a solid #fafafa.
Color is for emphasis only:
Red (#FF3B30) for counts that need action (the Approvals badge), errors, and categories over budget.
Orange (#FF9500, text #C93400) for "ahead of pace" warnings.
Green (#248A3D) only for money coming in.
Nothing else gets color: no brand color, and charts are black and grays.
Type: the system font stack (-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif). Large bold page titles (about 28 to 34px, weight 700, tight letter-spacing). Tabular numbers for all money. Remove Geist and Bricolage from app/layout.tsx.
Shapes: rounded corners (16px cards, 12px buttons, pill segmented controls and tab bar). Primary buttons are solid black with white text. Secondary buttons are glass with a hairline border.
No dark mode. Make the app light-only. Remove the prefers-color-scheme: dark block, set color-scheme: light, and stop all the existing dark: classes from applying by adding @custom-variant dark (&:where(.dark, .dark *)); in globals.css (nothing sets .dark). Update the themeColor viewport to the light gray. You don't have to delete every dark: class, but delete them in files you rewrite anyway.
Keep the "You've been reimbursed" pop-in moment and the receipt scan animation, restyled in black and white. Respect prefers-reduced-motion.
Icons: add lucide-react and use only its outline icons, at one stroke width. Icons sit in small rounded gray tiles (like iOS Settings rows) or bare in the tab bar.
Phase 1: design system (tag ui-1-tokens)
Rewrite app/globals.css with the tokens above as CSS variables plus Tailwind @theme entries. Replace the green/gold brand-* and gold-* ramps. The cleanest way to restyle old screens at once is to point the brand-* and gold-* names at the new neutral/black values for now, so nothing breaks while you restyle page by page. Note what you chose.
Build small shared components in app/_components/ui/: GlassCard, Button (primary/secondary/destructive), PageHeader (large title, optional subtitle, optional one action), StatTile (label, value, small note, optional emphasis color), SegmentedControl, ProgressBar (with an optional "pace" tick), ListRow (icon tile, title, subtitle, trailing value, chevron when tappable), Badge, Sheet (bottom sheet on phones, side panel on wide screens), EmptyState.
Add the fixed background layer (soft blurred gray shapes) to the root layout.
Phase 2: app shell and navigation (tag ui-2-shell)

One navigation for everyone in a club, based on role (useOrg().isTreasurer). The separate "member view" and "treasurer view" go away.

Items:

Everyone: Home (/c/[orgId]), Get reimbursed (/c/[orgId]/reimburse), Budget, Activity.
Treasurers also get a "Manage" group: Insights (new, /c/[orgId]/treasurer/insights), Approvals (/c/[orgId]/treasurer, with a red count badge), Members, Settings.
Budget goes to /c/[orgId]/treasurer/budget for treasurers (editable) and /c/[orgId]/budget for members (read-only).
Activity is a new in-shell page, /c/[orgId]/activity. It shows the same data as the public ledger, as iOS-style list rows, and each row keeps its Verify link. Leave the public /ledger/[orgId] route working for sponsors without login, restyled to match.
Approvals badge: use the waiting count from /api/orgs/[orgId]/treasurer/overview. Only fetch it for treasurers, and refresh it live (see Phase 5).

Layouts:

1024px and wider: content on the left, and a fixed glass nav rail on the RIGHT (about 240px, full height). From top to bottom, the rail has:
the club name with the club switcher (move ClubMenu here)
a black "Get reimbursed" button
Home, Budget and Activity
the "Manage" label and the treasurer items
the person's name and Log out at the bottom
The current page gets a darker glass highlight with a black icon tile and aria-current="page".
640px to 1023px: the same right rail collapsed to icons (about 72px). Each icon has an accessible name and a tooltip.
Under 640px (iPhone):
A slim glass top bar with the club name and switcher.
A floating glass pill tab bar near the bottom of the screen.
Members' tabs: Home, Reimburse, Budget, Activity.
Treasurers' tabs: Home, Insights, Approvals (badge), Members, More. "More" opens a sheet with Get reimbursed, Budget, Activity, Settings, switch club and Log out. Get reimbursed also stays as the big button on Home.
Tab targets at least 44px. Add viewport-fit=cover and pad the tab bar and page bottom with env(safe-area-inset-bottom).
Accessibility: the nav comes before the content in the DOM, with a "Skip to content" link, and CSS grid places the rail on the right. Focus is always visible.

Build it as one component (for example app/c/[orgId]/_components/AppShell.tsx with NavRail, TabBar and MoreSheet), mounted from ClubShell.tsx inside the existing OrgProvider and MembersOnly checks. Keep the Suspense wrapper in the layout.

Remove the old navigation:

the header "Menu" dropdown in AppHeader.tsx (its contents move into the rail and More sheet)
ClubLinks.tsx at the bottom of the member home
the pill tab bar and "Member view" link in TreasurerArea.tsx (keep its "Treasurers only" guard)
Phase 3: restyle every screen (tag ui-3-pages)

Go one page at a time, with one commit per page, using the Phase 1 components. Don't change what any page does, only how it looks and how it fits on a phone. The order:

Member Home:
large title
a glass balance card (club balance big, your balance small, black "Get reimbursed" and glass "Pay dues" buttons)
a "spent this period" ring for the club budget, using the existing member budget data
dues status
My requests with the Submitted → Approved → Paid step bar, restyled in black and gray
Recent activity (latest 5 from Activity, with a "See all" link)
Get reimbursed (photo → summary → result)
Budget (member, read-only) with progress bars
Activity (new page) and the public ledger
Approvals (treasurer dashboard):
stat tiles
budget bars
request tabs as a segmented control
requests as list rows
the request detail in Sheet (full-screen sheet on phones, side panel on wide screens)
Members. On phones, each person is a list row that opens a sheet with their actions.
Budget builder and Settings (grouped iOS-style form sections)
Login and onboarding (/, /start, /create, /join, /join/[code], /waiting/[orgId])

Nothing may scroll sideways at 375px wide.

Phase 4: Insights backend (tag insights-4-api)

Pure functions first, with tests, then thin routes. Reuse what exists. In particular, "spent" must mean exactly what the treasurer overview means: use SPENT_STATUSES and the helpers in lib/dashboard/overview.ts, and the club's categories, settings and period from lib/orgs/settings.ts and lib/dues/period.ts. Bucket dates by month in America/Chicago and write that down as a decision. All amounts are integer cents internally and formatted with lib/money.ts.

lib/insights/ (pure, no database access, each with a vitest file in tests/)
ranges.ts: the date range for month (this calendar month), semester (the club's current dues period if its setting is semester, otherwise the matching Aug–Dec / Jan–May term) and year (last 12 months). Also the list of months inside the range for chart buckets.
spending.ts:
spending per month per category for the range
the category totals
budget per month for the dashed budget line (sum of the club's category budgets, converting semester budgets to per-month)
pace.ts: for each category, spent, budget, percent used, the percent of the period that has passed ("where you should be today"), and a status: on_track, ahead_of_pace (spent share more than 10 percentage points over the elapsed share) or over_budget.
cashflow.ts: money in vs. money out per month from ledger_entries (direction in/out; kind dues/deposit/reimbursement), plus net, totals, and runwayMonths. Runway is the club balance divided by average monthly money out over the range. Return null when there's no spending.
byMember.ts: spending per member for the range (paid reimbursements), with display name (first + last name, falling back to email), total, number of requests and share of total, sorted high to low. Also each member's dues status for the current period.
vendors.ts: the top 5 vendors by total. Normalize case and whitespace when grouping, but display the most common original spelling.
csv.ts:
CSV building with correct quoting
spreadsheet formula-injection protection: prefix any cell starting with =, +, -, @, tab or carriage return with a '. Vendor names come from receipts and are untrusted. Add a test with a vendor named =HYPERLINK(...).
a UTF-8 BOM so Excel opens it cleanly
Routes (treasurer only, under app/api/orgs/[orgId]/treasurer/)
GET insights?range=month|semester|year. It returns one JSON object with everything the Insights page needs:
stat tiles (club balance, spent vs budget, dues collected, auto-approved share, runway)
spending by month (with budget line)
category totals
pace rows
cashflow by month
spending by member
top vendors
generatedAt
Define the response type in lib/insights/types.ts. Load rows with as few queries as possible, all filtered by org_id, then hand them to the pure functions. Get the club balance the same way the overview route does. If it fails, return the rest with balance: null instead of failing the whole response.
GET export?range=...&type=activity|requests|members returns a CSV download (Content-Disposition: attachment; filename="<club-slug>-<type>-<range>.csv").
activity: date, direction (In/Out), type (Dues/Deposit/Reimbursement), amount, description, member, Verify link (the existing Solana Explorer devnet link format used on the ledger).
requests: date submitted, member, vendor, receipt date, amount, category, status (plain English, reuse statusLabel), reason or denial note, date paid.
members: name, email, role, joined, dues paid this period (yes/no), total reimbursed in range, request count.
Treasurers may see member emails here, matching the ledger rule in CLAUDE.md.
Add both folders to whatever list tests/route-guards.test.ts uses for treasurer-only folders if they aren't covered automatically, and add a club-isolation test for the insights route (another club's treasurer gets refused).
Phase 5: live data (tag insights-5-live)

The charts and numbers must update by themselves when new information comes in. That means a member pays dues, a receipt is auto-paid, or a treasurer approves, all without a page reload. Tables use row-level security with no policies, so browser-side Supabase Realtime won't work. Don't change that.

Build one hook, useLiveData(url, { intervalMs }):
It polls with useAuthFetch: every 10 seconds for Insights and Approvals, and every 15 seconds for Home and Activity.
It pauses while the tab is hidden and refetches immediately when the tab becomes visible or the window regains focus.
It keeps showing the last good data while a refresh is in flight or fails, and only shows an error after two failures in a row.
It exposes refresh() and updatedAt.
Add a tiny app-wide "data changed" signal, a window event or BroadcastChannel("club-data"). Fire it after a successful dues payment, reimbursement submit, approve, deny or retry (from the existing client success handlers; don't touch the server routes). Every useLiveData instance refetches when it fires, so the screen you're on updates instantly and other open tabs follow.
Use the hook for the Insights page, the Approvals badge and overview tiles, Home balances and recent activity, and Activity.
Show a small "Updated just now / 2 min ago" label on Insights.
Animate chart changes smoothly: bars and rings ease to their new values over about 300ms, and new list rows fade in. Use no animation with reduced motion. Don't count numbers up.
Phase 6: Insights page (tag insights-6-page)

Build /c/[orgId]/treasurer/insights from the sketch I approved.

A large "Insights" title and a Month / Semester / Year segmented control. The selected range goes in the URL as ?range= so it survives a reload. Next to it, an "Export" button opens a small sheet with three choices: Activity, Requests, Members. The CSV is for the selected range.
Stat tiles:
Club balance (note: "Lasts ~N months" from runway)
Spent (note: "% of budget")
Dues collected ("3 of 4 paid")
Auto-approved share
Spending by month: black bars with a dashed gray budget line. The current, unfinished month gets a lighter bar.
By category: a donut in black and grays with the total in the center and a legend. A category that is ahead of pace or over budget gets orange or red in the donut and legend. Nothing else gets color.
Budget pace: one row per category, with a progress bar and a tick at "where you should be today". Status text appears only when it's not on track ("ahead of pace" in orange, "over budget" in red).
Money in vs. money out: paired bars per month. Money in is green-outlined or green, money out is black, and the net for the range is shown above the chart.
Spending by member: a horizontal bar list (name, bar, total, request count) and a dues paid / not paid marker. Tapping a member opens their Members-page sheet.
Top vendors: list rows.
On phones, these stack in this order: tiles (2×2), spending by month, pace, by category, money in/out, by member, vendors.

Build the charts yourself as small SVG React components in app/_components/charts/ (BarChart, LineChart, Donut, PairedBars, HBarList). Don't add a charting library. Each chart has:

role="img" with a one-sentence aria-label
a visually hidden data table with the same numbers
a hover or tap tooltip with the exact dollar value
a clean EmptyState when there's no data in the range ("No spending yet this semester")

On the iPhone Home, also add a treasurer-only "Insights" glass card under the balance card. It shows a mini spending line and the single most important alert (for example, "Food is ahead of pace"), and links to Insights.

Phase 7: final check (tag ui-final)
npm run lint, npm test and npm run build all pass.
Use the Playwright MCP at 390x844 and 1440x900 to screenshot every club page, as a member and as a treasurer, into .playwright-mcp/redesign/.
Check the earlier files in .playwright-mcp/ to see how previous sessions logged in.
If you can't log in, say so in PROGRESS.md and rely on build, tests and code review instead. Don't get stuck on it.
Check the live updates: with Insights open, trigger a change that doesn't move money if possible (deny a waiting request with a note, if one exists) and confirm the numbers update without a reload. If nothing safe is available, note that you tested the hook with unit tests only.
Walk the 7-step demo script from CLAUDE.md on the 390px viewport, as far as possible without running scripts that move funds, and note each step's result.
Finish PROGRESS.md with:
a summary
every decision you made
anything skipped or reverted
a short "what to look at first" list for me

Then stop.
