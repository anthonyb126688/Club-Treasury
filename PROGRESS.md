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
| 1 Design system | ui-1-tokens | not started |
| 2 App shell | ui-2-shell | partly exists (see "Starting point") |
| 3 Restyle every screen | ui-3-pages | not started |
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

## Skipped / reverted
- (none yet)

## Log
- Nov 17: wrote this file. Nothing from the new plan built yet.
