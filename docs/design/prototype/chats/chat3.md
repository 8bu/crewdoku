# Scheduling Rules Polish

_Started 2026-06-13 09:35 UTC_

---

## User

How lets polish the scheduling rules view. Interview me for brainstorming.

## Assistant

_[tool: read_file]_

Looks like your message came through empty! No worries — let me kick off the interview. I've read the current `RulesConfig` (the "Scheduling rules" section under Sysadmin). Right now it's pretty lean: three numeric inputs (max hours/week, min rest, max consecutive days) and some live-validation banners.

Let me ask you a few focused questions to understand where you want to take it:

---

**1. Scope of rules**

Right now there are 3 hard constraints. Do you want to expand this — e.g. add soft rules here too (or keep those only in Solver Weights), add per-department overrides, add time-based rules (e.g. "no Night shift on Sundays for dept X")? Or stay focused on global hard limits?

---

**2. Rule authoring model**

Should rules feel like a **form** (fill in values, save), or more like **constraint cards** you can toggle on/off independently, or something like a **rule builder** (IF / THEN / EXCEPT logic)? What's the user's mental model — are they a power admin or non-technical manager?

---

**3. Missing rule types**

What other constraints exist in your domain that aren't represented yet? For example:
- Max night shifts per month per person
- Weekend rotation fairness
- Minimum days off between certain shift types
- Contract-type rules (part-time vs full-time get different limits)
- Holiday / public holiday handling

---

**4. Validation UX**

The current banners warn about infeasibility. Do you want more of this — e.g. a "rules health" summary, conflict detection between rules, or a live "what % of employees would be affected" preview?

---

**5. Visual feel**

Should rules look more like a legal/compliance document (structured, formal), or a developer config panel (dense, code-like), or something more like a modern SaaS settings page (clean cards, icons, toggles)? The existing aesthetic is very Linear-like — want to push that further or go somewhere else?

---

Take any of these in whatever order feels right. Even partial answers help me build a plan.

## User

Can'

## Assistant



## User

Can't u launch the TUI interview? I don't like answering in the chat

## Assistant

_[tool: read_file]_

_[tool: update_todos]_

_[tool: write_file]_

On it — building now.

_[tool: done]_

_[tool: read_file]_

_[tool: str_replace_edit]_

Let me just fix the nested template literals causing the parse error.

_[tool: done]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

Let me read the exact state of the script section after my edits:

_[tool: read_file]_

## User

Bro, that's not what I mean. What's your usual Q&A UI?

## Assistant

_[tool: delete_file]_

Oh — you mean the built-in form! My bad for overcomplicating it.

_[tool: questions_v2]_

## User

Questions timed out; go with defaults

## Assistant



## User

Stop, ask me again

## Assistant

_[tool: questions_v2]_

## User

Questions answered:
- user: All three share it
- frustration: Decide for me
- authoring: Decide for me
- missing: Forbidden shift transitions (e.g. Night → Early), Max night shifts per month, Contract-type limits (PT vs FT), Min days off per week, Weekend rotation fairness, Holiday / public holiday overrides
- scope: Both dept + contract
- feedback: Decide for me
- toggleable: Decide for me
- visual: Decide for me

## Assistant

_[tool: read_file]_

Perfect. Here's my design call based on your answers:
- **Authoring**: Toggle cards with a 3-state (On / Warn / Off) per rule
- **Visual**: Dense minimal + color-coded by type (hard=red, policy=amber, fairness=violet)
- **Feedback**: Live "N staff affected" per rule
- **Scope**: Dept + contract override table
- **All 6 missing constraint types** added, plus forbidden transitions matrix + holiday editor

Let me read the exact RulesConfig to replace it cleanly:

_[tool: read_file]_

_[tool: str_replace_edit]_

Good — I have the exact bounds. Now I'll replace the whole `RulesConfig` block plus add the helper components:

_[tool: done]_

Clean load. Here's what's new in **Sysadmin → Scheduling rules**:

- **9 rules** across 3 color-coded groups (Hard / Policy / Fairness), each with a 3-state toggle (On / Warn / Off), inline value editor, and live "N staff" count
- **Forbidden transitions matrix** — click any cell to ban a shift-to-shift sequence; Night→Early is pre-banned
- **Scope overrides** — dept and contract-type tabs let you override Max hours, Min rest, Max nights, and Max weekends per group without touching globals
- **Holiday editor** — add closure dates by YYYY-MM-DD; solver skips H1 coverage on those days

## User

Holiday should support the national holidays of the country?

## Assistant

_[tool: str_replace_edit]_

Good idea. I'll add a country picker that shows pre-populated 2026 national holidays (checkable, bulk-importable). Let me write the data and update `HolidayEditor`:

_[tool: done]_

Clean. **Sysadmin → Scheduling rules → Holidays & closures** now has:

- **Country picker** (10 countries: DE, FR, GB, NL, BE, PL, SE, US, ES, IT)
- Selecting a country expands the full list of 2026 national holidays, all pre-checked
- Already-added dates are greyed out and marked "added"
- **"+ Add N dates"** imports the checked selection in one click, then collapses the panel
- Manual YYYY-MM-DD entry still works alongside it

## User

Dont do that. Make the holiday list importable, from a simple json file or even txt/csv.
Also holiday is repeatable, right? So what's the point of year in the UI? I know there are holidays that happen occassionally, but most of the holidays are annual. So we should support annual holidays as default, and allow the user to create new occassional holidays.

## Assistant

_[tool: str_replace_edit]_

Good callout on both fronts. Three changes:
1. **Drop the hardcoded country data** — import from file instead (JSON, CSV, TXT)
2. **Annual by default** — store as `MM-DD`, no year. Year only for one-time closures
3. **Update RulesConfig** to init with the new structure

_[tool: str_replace_edit]_

Now fix the initial state in `RulesConfig` and remove the placeholder comment:

_[tool: done]_

Clean. **Sysadmin → Scheduling rules → Holidays & closures** now works like this:

- **Annual** (MM-DD) — "12-25, Christmas Day" repeats every year, no year shown
- **One-time** (YYYY-MM-DD) — specific closures listed separately
- **Import file** — drop a `.json`, `.csv`, or `.txt`. Formats accepted:
  - `12-25,Christmas Day` → annual
  - `2026-08-15,Summer closure` → one-time
  - JSON array: `[{"date":"12-25","name":"Christmas Day"}]`
- Manual add still works with the same smart format detection

## User

Put up some example files

## Assistant

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: present_fs_item_for_download]_

Three files in the zip — drag any one into **Import file** to test:

- `holidays-annual.csv` — German public holidays, all annual (MM-DD)
- `holidays-us.txt` — US federal holidays + one one-time closure
- `holidays-mixed.json` — UK holidays with two company-specific one-time dates mixed in

## User

Or do we have standards for this kind of thing? Like a file/list of multiple national holidays, open source?

## Assistant

_[tool: web_search]_

Yes — a few well-established options:

**The actual standard: iCalendar (`.ics`, RFC 5545)**
The UK Government endorsed the iCal format in its "Open Standards for Government" series, and provides national holidays as a `.ics` file from gov.uk. Every government that publishes machine-readable holiday calendars uses `.ics` — Google Calendar, Apple Calendar, and Outlook all subscribe to them directly. It's the closest thing to a universal standard.

**Best open-source data sources:**

- **[Nager.Date](https://github.com/nager/Nager.Date)** — 100+ countries via a free REST API, also has a JSON export. The most popular open-source holiday dataset.
- **[OpenHolidays API](https://publicapis.dev/category/calendar)** — open REST API covering public and school holidays for many countries.
- **[Azure Open Datasets](https://learn.microsoft.com/en-us/azure/open-datasets/dataset-public-holidays)** — CC-BY-SA licensed, holiday data from 1970 to 2099.

**Practical recommendation for ShiftForge:**

Adding `.ics` import would be the highest-value move — admins could literally paste in their country's government holiday calendar URL and subscribe to it, so holidays auto-update year over year. Worth considering for a v2 of the importer. Want me to add `.ics` parsing support alongside the existing JSON/CSV?

## User

lets support multiple open source datasets and models.

## Assistant

_[tool: str_replace_edit]_

Good. I'll update the importer to auto-detect and parse four formats: **iCalendar (.ics)**, **Nager.Date JSON**, **OpenHolidays API JSON**, and our existing **CSV/TXT**. Each is identified by structure, not filename.

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: str_replace_edit]_

Now I have the full picture. I'll replace the parser block and toolbar in one edit:

_[tool: str_replace_edit]_

Also clean up the old static format hint:

_[tool: done]_

Clean. The importer now auto-detects 5 formats — hit **formats ?** in the toolbar to see the cheat sheet:

| Format | Source |
|---|---|
| **iCalendar (.ics)** | Any government holiday calendar, Google Calendar export |
| **Nager.Date JSON** | `nager.date/api/v3/publicholidays/2026/DE` |
| **OpenHolidays API JSON** | `openholidaysapi.org` |
| **JSON** | Our own `[{"date":"MM-DD","name":"..."}]` |
| **CSV / TXT** | `MM-DD,Name` or `YYYY-MM-DD,Name`, `#` for comments |

Detection is automatic — no format selector needed. Import result shows how many were added, which format was detected, and how many were already present.

