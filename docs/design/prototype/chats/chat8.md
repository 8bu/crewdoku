# Revamp the onboarding flow

_Started 2026-06-16 17:00 UTC_

---

## User

Revamp the onboarding flow

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: questions_v2]_

## User

Questions answered:
- goal: Visual design needs a lift, Not enough guidance / context for first-timers, Explore a few options
- scope: Organisation name + departments (keep), Employee roster (keep), Shift definitions (new), Scheduling rules / constraints (new), A welcome / intro screen (new), A confirmation / summary screen (new), Keep it lean — fewer steps is better
- employee_entry: CSV, row based textarea's also ok
- dept_entry: Cover both quick creation and verbose/robust options (cards, colour, icons, etc.)
- visual_direction: Match the app chrome exactly — same density, same tokens
- progress: Decide for me
- demo_data: Demo data should be hidden by default (even in empty board state). And to be offered as an option to the user in the wizard, but not entire setup, just load demo step by step. (split scope)
- validation: On-submit — only check when clicking Continue
- extra_notes: For better UX and onboarding experience, we should optimize the onboarding flow to be easy to understand and quick to complete.

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: update_todos]_

Let me build this now.

_[tool: write_file]_

Now updating `app.jsx` to hide demo data from the empty board state:

_[tool: str_replace_edit]_

_[tool: update_todos]_

_[tool: ready_for_verification]_

_[tool: save_screenshot]_

_[tool: show_html]_

_[tool: update_todos]_

Hey — it looks like you might be having trouble getting a message through. Here's a summary of everything that's been built and is live in `Crewdoku.html`:

---

**What changed**

**`onboarding.jsx`** — full rewrite, 6-step wizard:

| Step | Content |
|---|---|
| **Welcome** | Brand mark, value prop, 4-step overview, "~3 min" estimate |
| **Organisation** | Org name + dept rows — click the colour dot to expand a swatch picker (8 colours) |
| **Shifts** | Table with inline editing · 3 presets (3-shift 8h, 2-shift 12h, Custom) · start time + duration selects, auto-shows end time |
| **Rules** | H2–H6 constraints — number inputs for hrs/rest, pill toggles for on/off |
| **Team** | Textarea + CSV import, live parse count |
| **Summary** | 2×2 cards — hover to reveal "Edit ←" link back to any step |

Each of steps 1–4 has a `⤓ demo [org/shifts/rules/team]` link in the nav bar that pre-fills just that step with SF demo data, so users can explore incrementally without committing to full demo mode.

**`app.jsx`** — `EmptyBoardState` simplified to a single CTA ("Set up your organisation →"), demo data removed from that view entirely.

---

Let me know if anything needs adjusting — copy, layout, step content, validation behaviour, etc.

## User

Onboarding mean no data, why the fuck configuration still has data and show up?

## Assistant

Fair point. The `SF` globals are always pre-populated with demo data, so Config shows that even when `dataMode === "empty"`. Two fixes needed:

1. `showEmptyBoard` should cover **all** views (not skip when `adminView === "config"`)
2. Config nav items should be disabled/greyed when no data is loaded

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

`isDataLoaded` is in `App` scope but `Sidebar` doesn't receive it. Need to pass it as a prop.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Clean. Here's the current state:

- **Empty board** → single CTA only, no demo data shortcut
- **Sidebar config items** → greyed out + `cursor-not-allowed` + tooltip "Complete setup first" until data is loaded
- **Config surfaces** never render while `dataMode === "empty"` — the empty state/wizard always takes over the whole content area

Let me know what you'd like to tweak next.

## User

Make the reset to empty option as a config item. Also hide the i18n - future release, idk why it’s there?? I said comment/note in the code. Not put it in the UI

## Assistant

## Assistant

_[tool: show_html]_

## Assistant

Two separate issues — let me look at both at once.

_[tool: grep]_

_[tool: grep]_

Three fixes in one go:
1. Remove the redundant brand row from onboarding (sidebar already has it)
2. Rename "Req/day" → "Min staff"
3. From your earlier message: add "Reset" as a config item + kill the i18n switcher from the UI

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

Got it. All four fixes in one shot:
- Remove brand row from onboarding (sidebar has it)
- Rename "Req/day" → "Min staff"  
- Add Reset as a nav item in Config section (always enabled)
- Kill the sidebar footer + locale switcher entirely

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

All four fixes are live — let me know what you'd like to work on next.

## User

staff = min head count? we also need a max cap

## Assistant

_[tool: read_file]_

Got it — max is an optional cap, blank = uncapped. Adding a "Max" column (smaller, greyed placeholder).

_[tool: str_replace_edit]_

_[tool: read_file]_

The rows are too compact to explain the distinction. I'll give each rule a title + subtitle and rewrite the labels so H3 (cross-day rest gap) vs H4 (same-calendar-day block) are unambiguous.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now update the row layout to show the subtitle:

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Let me show you the current shifts table so you can react:

_[tool: show_html]_

Having trouble getting your messages through? Current state of the shifts table:

- Columns: **Code · Name · Start + Duration · Min/day · Max/day**
- Max/day is optional — blank = uncapped (shows `—` placeholder)

If "Min/day" / "Max/day" still isn't clear enough, I can rename them to **"Staff min"** / **"Staff max"**, or add a tooltip/footnote like *"headcount per day"* under the table. Let me know what feels right.

_[tool: grep]_

The whole app is 10–12px text. Rather than touching global tokens, I'll scope a font bump just to the wizard — shifting each size up one step.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Seems like your messages might not be coming through fully. Here's where we are on the onboarding revamp:

| What | Status |
|---|---|
| 6-step wizard (Welcome → Org → Shifts → Rules → Team → Summary) | ✓ |
| Double logo removed | ✓ |
| Demo data hidden from empty board, accessible per-step in wizard | ✓ |
| Config nav disabled until setup complete | ✓ |
| Reset moved to sidebar nav (always accessible) | ✓ |
| i18n switcher removed from UI | ✓ |
| Min/Max headcount per shift | ✓ |
| H3/H4 rules — clearer labels + descriptions | ✓ |
| Font size bumped in wizard | ✓ |

Let me know what to tackle next — copy tweaks, validation behaviour, summary step, or anything else.

The 44px min/max columns are too narrow for the label. Widening them and tightening the remove button.

_[tool: str_replace_edit]_

Two changes: bump the global tokens in `tokens.css`, then remove the now-redundant wizard-scoped override.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

All live — font sizes bumped globally (11/12/13/14/16px), wizard scoped override removed. Let me know what's next.

## User

Min/day and Max/day are still very confusing. Min what per day? Max what per day?

## Assistant

Rename columns to "Staff min" / "Staff max" and call it out explicitly in the section description.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Live — "Staff min" / "Staff max" with the explanation in the subtitle. What's next?

## User

Min head(count) - max head(count)?

## Assistant

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Done. Let me know what else needs work.

## User

and yes it overflow again

## Assistant

The labels are ~8 chars uppercase with tracking — 56px still isn't enough. Bumping to 70px and trimming the start+duration column slightly to compensate.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Looks like your messages may not be coming through — are you trying to attach a screenshot? If the overflow is still happening, try sending an image and I'll fix it from that.

## User

Schedule table stil looks very tight and unreadable.

## Assistant

The table is too narrow (480px max-width) and rows too short. I'll widen the wizard content area, increase row height, and remove the truncated end-time so the start+duration column has room to breathe.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Waiting on you — send a screenshot or describe what's still off and I'll fix it.

## User

Yes better. Can you hide the arrow indicators of all input[type=number] in our app?

## Assistant

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Done — spinners gone across the whole app. What's next?

## User

Btw we have new logo, try it out!

## Assistant

_[tool: image_metadata]_

_[tool: copy_files]_

_[tool: view_image]_

The PNG canvas is 1440×562 with the icon centered — awkward for a 18px slot. I'll recreate it as a clean SVG that scales perfectly at any size.

_[tool: write_file]_

Now swap the "CW" badge in the sidebar and the welcome step:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Live — logo showing in the sidebar and welcome step. How does it look? Anything to tweak on the sizing or positioning?

## User

Use this new one

## Assistant

New logo — CRWDOKU in the grid. Recreating as SVG:

_[tool: write_file]_

_[tool: ready_for_verification]_

Live — new CRWDOKU logo in both the sidebar and welcome step. How does it look?

## User

ok update this one

## Assistant

_[tool: copy_files]_

_[tool: image_metadata]_

Same wide canvas issue. I'll update the SVG to match the refined hook shapes and outer body of the new version instead:

_[tool: write_file]_

_[tool: ready_for_verification]_

Live — updated logo with squared hooks. Let me know if it needs any further tweaks.

## User

Ok brief what we just update compare to the older version?

## Assistant

Here's a summary of everything changed in this session vs. the previous onboarding:

---

**Onboarding wizard — full rewrite**
- Was: 2-step wizard (org name + depts, then employee list)
- Now: 6-step wizard — **Welcome → Organisation → Shifts → Rules → Team → Summary**

**Welcome screen** — new, brand mark + value prop + 4-step overview, "~3 min" estimate

**Demo data** — hidden from empty board state entirely; now offered as a **per-step shortcut** (`⤓ demo org`, `⤓ demo shifts`, etc.) inside the wizard only

**Shifts step** — new; inline table with code, name, start+duration selects, min/max headcount, 3 quick-load templates (3-shift 8h, 2-shift 12h, Custom)

**Rules step** — new; H2/H3/H4/H6 each with a **title + description** so they're not ambiguous. H3 (rest gap) vs H4 (same-day block) clearly distinguished

**Summary step** — new; 2×2 card review, hover any card to jump back and edit

**Empty board state** — simplified to a single CTA ("Set up your organisation →"), demo button removed

**Sidebar — config nav** — items greyed out + tooltip until setup is complete

**Reset to empty** — moved from the sidebar footer into the nav as a proper item (always accessible, with confirm dialog)

**i18n switcher** — removed from UI (kept as code comment only)

---

**Global polish**
- Font sizes bumped app-wide (10→11, 11→12, 12→13, 13→14, 15→16px)
- Number input spinners hidden globally
- New logo (CRWDOKU calendar grid) in SVG — replaces the plain "CW" badge in sidebar and welcome step
- Duplicate logo removed from wizard (sidebar already has it)

## User

i18n switcher NEEDS to be visible. THE COMMENT IS REMOVED NOT THE UI

## Assistant

My bad — I removed both. Let me put the locale switcher back in the sidebar footer.

_[tool: read_file]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Locale switcher is back in the sidebar footer. What's next?

## User

send the brief again

## Assistant

Here's the full session brief:

---

**Onboarding wizard — full rewrite**
- Was: 2-step wizard (org name + depts, employee list)
- Now: 6-step — **Welcome → Organisation → Shifts → Rules → Team → Summary**

**Welcome** — brand mark, value prop, 4-step overview, "~3 min" estimate

**Organisation** — org name + dept rows with colour picker (8 swatches per dept)

**Shifts** — inline table: code, name, start + duration selects, **min headcount / max headcount** (max optional, blank = uncapped); 3 quick templates (3-shift 8h, 2-shift 12h, Custom)

**Rules** — H2/H3/H4/H6 each with title + description. H3 = rest gap between shifts; H4 = block same-day double shifts — clearly distinguished

**Team** — textarea + CSV import, live parse count

**Summary** — 2×2 review cards, hover → "Edit ←" jumps back to any step

**Per-step demo shortcut** — `⤓ demo org / shifts / rules / team` fills just that step with SF data; no full "load demo" button anywhere

---

**Empty board state**
- Single CTA only ("Set up your organisation →"), demo button removed

**Sidebar**
- Config nav greyed out + tooltip until setup complete
- Reset to empty moved into the nav (always accessible, confirm dialog)
- i18n locale switcher restored to sidebar footer
- New SVG logo (CRWDOKU calendar grid) replaces the "CW" badge

---

**Global polish**
- Font sizes bumped app-wide (+1px per step)
- Number input spinners hidden globally
- Duplicate logo removed from wizard header

## User

I need a check list not this shit

## Assistant

- [x] 6-step wizard (Welcome → Org → Shifts → Rules → Team → Summary)
- [x] Welcome screen with brand mark + overview
- [x] Org step — name + dept colour picker
- [x] Shifts step — table with code/name/time/headcount, 3 templates
- [x] Min headcount / Max headcount columns (max optional)
- [x] Column headers fixed — "Min head" / "Max head"
- [x] Rules step — H2/H3/H4/H6 with title + description
- [x] H3 vs H4 clearly distinguished
- [x] Team step — textarea + CSV import
- [x] Summary step — 2×2 cards, hover to edit
- [x] Per-step demo shortcut (`⤓ demo …`)
- [x] Demo data hidden from empty board state
- [x] Empty board → single CTA only
- [x] Config nav disabled until setup complete
- [x] Reset to empty moved into sidebar nav
- [x] i18n switcher removed from sidebar (comment only) → **restored**
- [x] Duplicate logo removed from wizard
- [x] New SVG logo in sidebar + welcome step
- [x] Font sizes bumped globally
- [x] Number input spinners hidden globally
- [x] Shift table overflow fixed (wider columns)
- [x] Number spinner arrows hidden

## User

30 employees parsed — unmatched → Production A 

What's unmatched?

## Assistant

It means employees whose dept column didn't match any defined department — they fall back to the first dept. The message is cryptic. I'll make it contextual: only show the fallback note when there are actually unmatched rows, and word it clearly.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Live. Now:
- Normal case: "30 employees ready to import" (no noise)
- Only if some rows had an unrecognised dept: "3 rows had an unrecognised department — assigned to Production A"

What's next?

## User

note down how that logic works, I will tell the coding agent to implement it.

## Assistant

**Department matching logic — Team step**

**Input format**
Each line in the textarea: `Employee Name` or `Employee Name, Department Name`

**Parsing**
1. Split by newline, trim, skip blank lines
2. For each line, split on the first `,` → `name` + optional `deptRaw`
3. Look up `deptRaw` against defined departments (case-insensitive string match on `dept.name`)
4. If match found → assign `deptId` to that dept
5. If no match (missing column, typo, unrecognised name) → assign `deptId` to `depts[0]` (first defined dept = fallback)

**Status feedback**
- Count total parsed employees → show "N employees ready to import"
- Count "unmatched" rows: rows where `deptId === depts[0].id` AND the original line had a dept column that didn't match any dept name (i.e. the fallback was triggered, not just omitted)
- If `unmatched > 0` → show warning: "N rows had an unrecognised department — assigned to [depts[0].name]"
- If `unmatched === 0` → no warning shown (either all matched, or all had no dept column — both are fine)

**On finish**
- Employees are grouped by `deptId`
- Employees with no dept column (no comma in line) silently go to `depts[0]` — no warning, intentional default
- Only rows that *tried* to specify a dept but got it wrong surface the warning

