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
| 4 Insights backend | insights-4-api | not started |
| 5 Live data | insights-5-live | not started |
| 6 Insights page | insights-6-page | not started |
| 7 Final check | ui-final | not started |

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

## Skipped / reverted
- (none yet)

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
- NEXT: Phase 4 (Insights backend). Start with `lib/insights/ranges.ts` + tests.
- Phase 3, page 1 (Home) done: glass balance card (club balance big, your balance small, black Get reimbursed, glass Pay dues), budget ring, dues status, My requests in a glass list with a black step bar, Recent activity (latest 5, "See all").
