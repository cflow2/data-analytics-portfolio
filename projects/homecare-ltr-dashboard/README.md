# HomeCare+ LTR & Customer Intelligence Dashboard

A local, single-page analytics app for HomeCare+ LTR reporting from surveys: LTR, detractors, attributes, Voice of the Customer (survey comments), the weekly LTR slide and the daily pulse. Contact-center calls are out of scope.

- Runs entirely on your laptop. No server, no login, no AI, no telemetry, no CDNs; outbound network is blocked.
- Data lives in this browser's IndexedDB. Export or import a JSON backup from **Data Manager**.
- `npm run build` produces **one self-contained HTML file** (`dist/index.html`, ~2.7 MB). Double-click it to open it offline.

> **Status:** all build phases complete (phase 5 built without AI — see [No AI, no network](#no-ai-no-network)). Contact-center calls, the WBR Builder and Cross-Channel were removed when the app moved to survey LTR only; opening the new version deletes any stored call data once (survey data is untouched).

## Quick start (on the work laptop)

1. Copy `dist/index.html` somewhere permanent (e.g. `Documents\HomeCare\`) and open it in Edge or Chrome by double-clicking.
2. **Data Manager → Load demo data** to look around, then **Remove demo** before loading real files.
3. Drop this week's files on **Data Manager** (see [Uploading files](#uploading-files-data-manager)).

Your data stays in the browser profile for `file://` pages. Replacing `index.html` with a newer build keeps it. Clearing browser data, or using a different browser or profile, does not, so **export a backup** from Data Manager regularly (it contains original, unredacted text — keep it on the work laptop).

## Weekly workflow

| When | What | Where |
|---|---|---|
| **Daily, morning** | Pick today's date; read or copy the 60-second script on the surveys that came in (Monday covers the weekend). | **Daily Pulse** |
| **Monday** | Upload the LTR Tracker, Medallia Responses export, Analytics report, Customer Commentary, the detractor follow-up file, and a Store→District CSV if stores show as Unmapped. Read each file's validation report. | **Data Manager** |
| **Tuesday** | 1. Check **Command Center** alerts. 2. Clear the **Review Queue** (low-confidence tags, uncertain redaction; add phrases to the rules as you go). 3. Skim **VOC Themes** and **Detractors**. 4. Open **LTR Slide**: check the validation panel, confirm the six callouts and card text, add the RedVest shout-out, then download the .pptx (or PNG) and the talk track. | Several |
| **Wednesday** | Present the slide (or use **Present** mode). Log every leadership question in **LTR Slide → Leadership questions log**; next week's talk track opens with them, answered from that week's data. | LTR Slide |
| **After the WBR** | Lock the week on **Data Manager** (read-only) and export a backup. | Data Manager |

## Setup (development)

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: rules, calendar, parsers, redaction, tagging, writing, Ask, LTR slide (140+ tests)
npm run lint
npm run typecheck
npm run build      # → dist/index.html (single file, works from file://)
npm run e2e        # quality checklist against dist/index.html (needs Playwright + Chromium)
npm run e2e:a11y   # axe accessibility audit, every screen, light + dark (needs Playwright)
npm run e2e:phone  # every screen at iPhone size (needs Playwright)
```

Requires Node 20+. The two `e2e` scripts need Playwright (`npm i -D playwright && npx playwright install chromium`, or `CHROMIUM=/path/to/chrome`); they aren't in `package.json` because the app itself doesn't need them.

## Business rules (where they live, how to change them)

| Rule | File / setting | Guarded by |
|---|---|---|
| LTR % = 9–10 ÷ all valid 0–10 scores (not NPS) | `src/lib/ltr.ts` | `src/lib/ltr.test.ts` |
| Detractor = 0–8; secondary split 0–6 / 7–8 | `src/lib/ltr.ts` | `src/lib/ltr.test.ts` |
| Sample-size flags (<5 No trend, 5–9 Directional, ≥30 Strong); no colour when n < 5 | `src/lib/ltr.ts`; thresholds in **Settings** | `src/lib/ltr.test.ts` |
| Benchmark 93% | **Settings** | — |
| 4-5-4 calendar, Sat–Fri weeks, FW1 = 2026-01-31, WBR = week end + 5 days, quarter = ⌈FW ÷ 13⌉ | `src/lib/fiscal.ts`; FY start in **Settings** (for FY27) | `src/lib/fiscal.test.ts` (also checked against the Tracker's `Fiscal Calendar` sheet on import) |
| LTR source of truth = Tracker `Likelihood to Recommend`; `Score` (100/0) is checked, not used | `src/ingest/parse.ts`, `src/domain/survey.ts` | `src/ingest/pipeline.test.ts` |
| District from the store→district mapping, never from Lowe's Market | `src/ingest/parse.ts` | `src/ingest/tracker.test.ts` |
| A newer Tracker replaces the weeks it covers (removed surveys are deleted and reported) | `src/ingest/commit.ts` | `src/ingest/pipeline.test.ts` (“a newer Tracker restates past weeks”) |
| Points lost per theme = 100 × (0–8 surveys with that primary theme) ÷ n | `src/analytics/pointsLost.ts` | `src/analytics/pointsLost.test.ts` |
| Follow-up: Documented only when member contact is described; blank = Missing; voicemail = Documented | `src/ingest/followup.ts` | `src/ingest/specs.test.ts` |
| Theme taxonomy, keyword rules, default status | **Settings → Theme taxonomy** (stored); defaults in `src/domain/taxonomy.ts` | `src/tagging/engine.test.ts` |
| Primary-theme precedence, sub-tags | `src/tagging/engine.ts` | `src/tagging/engine.test.ts` |
| Redaction rules | **Settings → Redaction rules**; defaults in `src/ingest/redact.ts` | `src/ingest/redact.test.ts` |
| Theme pattern (Emerging 1 week / Repeated 2–3 / Persistent all 4, 4-week window) | `src/analytics/themes.ts` | `src/analytics/themes.test.ts` |

**Changing a coded rule:** edit the file, update its test, run `npm test`, then `npm run build`. The LTR and detractor guard tests fail on purpose if either rule changes. Settings-based rules (benchmark, thresholds, FY start, taxonomy, redaction) change without a rebuild.

## Uploading files (Data Manager)

Drop any mix of files on **Data Manager**. Each one is read in a Web Worker, so the UI never freezes, and detected from its sheet names and headers:

| File | Detected by | Notes |
|---|---|---|
| LTR Tracker (`LTR_Tracker*.xlsx`) | sheet `Export Data`, header found on row 3 | ~330 columns from all Lowe's survey programs; uses Surveyid, Lowe's Region, Store # (+ `Store` for city/state), Date Only, Appointment ID, Likelihood to Recommend (col “Likelihood to Recommend”, which equals the HomeCare+ LTR question wherever both are filled), ` Score`, FW # and the HomeCare+ comment. **Attributes are never taken from the Tracker** (its similarly named columns belong to other programs). Also reads the hidden `Servicing Selling Stores` (store → district), `Detractors` (SM follow-up) and `Fiscal Calendar` (checked against the app's calendar) sheets; other sheets are not converted, which keeps a 20 MB Tracker to ~2–3 s. Formula-only rows are ignored. |
| Medallia Responses export | header on row 2 | Adds comments, the nine attributes, and `Project number` as the Job ID (plus customer name/phone if the export has them). Merged into the matching Tracker survey (by ID, appointment, or date+store+score); never counted in LTR. |
| Medallia Analytics driver report (`Analytics - <timestamp>.xlsx`) | rows = measures, columns = days (`14 Sat` … `20 Fri`, `Total`, `Benchmark`), weeks (`FW40`, `Week of 07/26`, `Week ending 08/01`) or months (`Nov 2026`); a long `FW, Attribute, Top 2 Box %, n` layout also works | Day columns are dated from the export timestamp in the file name and rolled up to fiscal weeks weighted by each day's Sample Size (this reproduces Medallia's Total). “Week of” columns carry no year: the first is the latest such date on or before the export date, later ones move forward (across New Year too). Medallia's weeks run Sun–Sat, one day after the fiscal week (Sat–Fri), so each is assigned to the fiscal week sharing 6 of its 7 days and the report says so; for exact fiscal weeks, export split by day. A last week still in progress is flagged. Medallia labels map to the nine attributes (Project Value → Value for money, Ease of Process → Ease of process prior, Amount of Time… → Time to get an appointment, …). n = Sample Size. The LTR row is cross-checked against the Tracker; Benchmark is ignored. |
| Customer Commentary | header on row 2; `date, score, comment` | Fills comments on matching Tracker surveys. |
| Detractor follow-up (`FW40.xlsx`, or the Tracker's `Detractors` tab) | `LL, Score, Comment, Store, SM, Insights, Region, FW, FQ, FP` (header on row 1) | Insights → **Documented** only when contact with the member is described (called, contacted, spoke, left a voicemail, “customer confirmed…”); emails, plans (“I will call…”, “store asked to contact…”) and internal reviews/coaching → **Email only**; blank → **Missing**; detractors absent from the file → **Missing**. Names in the SM column are redacted wherever they appear. FQ/FP are checked against the calendar. |
| Store→District CSV | `Store #, Store Name, City, State, District, Region` | Also uploadable from Settings. |
| HomeCare+ subscription export (`data - <timestamp>.xlsx`, sheet *Export*) | `Store, Week, Net MLRHC+ Subscriptions, Net MLRHC+ Store Subscriptions` (+ online, revenue, store set, division, region, district, Completed Appointments, Regular, Assessments, Follow UP, Exceptions, Follow Up Required) | One row per store per fiscal week, year to date; the trailing "Applied filters" row is skipped. Each upload replaces that fiscal year's weeks **and saves a snapshot** of the current and prior week by store. The export time in the file name sets the snapshot's *data-through* date (the day before). Upload it every morning: yesterday's sales = this snapshot's week-to-date minus the previous one; "same point last week" = the snapshot from 7 days earlier. |
| Appointment file (RedVest Associate) | `Appointment ID` + `Associate` required; `Job ID`, `Store #`, `Appointment date`, `Customer Name` (or `First Name` + `Last Name`) and `Customer Phone` optional (common names such as *Appt ID*, *Technician Name*, *Job #*, *Service Date* are recognised; otherwise map the columns once) | Links each survey to its associate by Appointment ID, whichever file is loaded first. The report says how many loaded surveys were linked. If one Appointment ID lists two associates, the first is kept and the conflict is reported. Customer name, phone and Job ID are used only by **Email SM** on the Detractors screen. |

Headers are matched fuzzily (case, spaces, curly quotes). If a required column isn't found, the **column-mapping dialog** opens; the mapping is remembered for future uploads. Re-uploading a file never duplicates records (deterministic IDs). **Locked weeks are read-only**: no imports or deletes, no tag overrides, root-cause edits, notes, headline or slide edits (exports still work; untagged records still get their first rule tags).

Each import produces a **validation report**: rows read/kept/dropped and why, dates and fiscal weeks found, Score vs LTR disagreements, the Tracker non-promoter count vs the follow-up file (naming missing surveys), unmapped stores, and redaction counts.

**Source of truth:** LTR is computed only from Tracker rows (`Likelihood to Recommend`; the `Score` column is checked against it and disagreements are listed).

**A newer Tracker replaces the weeks it covers.** Tracker surveys that an earlier Tracker had but the new one doesn't (dated on or before the new file's last survey) are removed, and the report lists them by week. This happens in practice: consecutive weekly Trackers have dropped surveys from earlier weeks. The LTR Slide's validation panel and Back pocket flag any week that changed after it was presented (compared with the saved snapshot).

## Privacy

- On import, comments and SM insights pass through a **redaction** step: emails, order numbers (12+ digits), US phone numbers, street addresses, names after `CX`, `Caller`, `Spoke with:`, `Name:`, `Mr/Mrs/Ms`, names after `Store Manager`/`SM`/`technician`/`associate`, “First Last” before an action verb (“… reviewed”, “… contacted”), every name listed in a follow-up file's SM column, and ~900 common US first names bundled locally (words that are also ordinary words — Will, Mark, May, Bill, Jack… — are excluded). Remaining capitalised words after “with/by/tech/associate” mark the record *uncertain* for the Review Queue. “No Comment”-style placeholders are treated as blank. Rules are editable in **Settings → Redaction rules** (with a test box).
- Original text is stored only in IndexedDB (`originals` table). The UI shows redacted text; "Show original" relocks after 60 s and is unavailable in Presentation mode.
- Text where PII may remain (e.g. "spoke with bob jones") is flagged for the Review Queue.
- The JSON backup contains original text — keep it on the work laptop.
- **Customer name and phone** (appointment file, or a Medallia export that has them, or typed in the email composer) stay in IndexedDB and appear only inside the **Email SM** composer, never on screens, tables, exports or in Presentation mode. The composer quotes the customer's **original** comment, because the store needs the exact words; it reaches Outlook only when you click Copy.
- **RedVest Associate names** from the appointment file may appear anywhere: screens, filters, tables, exports and Presentation mode (decision of 11/25/2026). Names written *inside* comment text are still redacted.

## Theme tagging (rules engine)

Every survey comment is tagged on import (and on **Data Manager → Re-run tagging**) with one primary theme, up to 3 secondary themes, a sub-tag where one applies, sentiment, a confidence, and a damage/safety flag. Tags show their source: **Rule**, **AI** (phase 5) or **Manual**. Manual tags are never overwritten.

- Keyword rules live in **Settings → Theme taxonomy** (phrases, `word*`, `/regex/`; single words also match plurals), with a test box.
- Primary precedence: safety/damage > failed experience > service demand > specific praise > general praise. Positive mentions of scheduling or value are general praise; associate praise vs concern is judged on the associate words.
- Never inferred from the score, Medallia topic tags or blank comments (“No Comment” counts as blank).
- Confidence < 0.7 → **Review Queue** (keys 1–9 / Enter / S); overrides can add the deciding phrase to the rules.
- Theme pattern (last 4 weeks): Emerging = seen in 1 week, Repeated = 2–3 weeks, Persistent = all 4.

On the demo data the rules reproduce every baseline exactly; on a real FY26 Tracker about 8% of comments land in the Review Queue.

## Filters

**Fiscal week · Compare to · Division · Region · District · Store · Associate**, all kept in the URL so every view is linkable. Choosing a division narrows the region list (Lowe's Division from the Tracker, else the region config in Settings); each level clears the levels below it. **Associate** appears once an appointment file is loaded and lists the associates in the current division/region/district/store.

## Where LTR points went

Every survey that scores 0–8 costs 100 ÷ n points of LTR (0.5 pts when n = 200). **Where LTR points went** (Command Center and VOC Themes) groups those surveys by their comment's primary theme, plus *No comment*, so the rows add up exactly to 100 − LTR. It shows each theme's points this week and last week. The LTR Slide's Back pocket carries the same split. `src/analytics/pointsLost.ts`, tested in `pointsLost.test.ts`.

## Services members want added

**VOC Themes → Services members want added** ranks services outside the standard visit (tankless and gas water heaters, roof-vented dryer vents, second-story work, gutters, light fixtures, garage doors, detectors…) by how many members mention them. A mention only counts when the comment asks for the service or says it wasn't covered (or is tagged Service-add or Exclusions), so “they changed my HVAC filter” doesn't count. It shows asked-to-add vs told-not-covered, this week, % that still scored 9–10, and when it was last seen, for FYTD, 13 weeks or the week. Click a service for its comments; the table exports to CSV/Excel. The service list lives in `src/analytics/serviceRequests.ts`.

## Email the store manager (Detractors)

Every detractor row has **Email SM**. It opens a composer with the email laid out like the standard store manager note:

- the greeting with the SM's first name
- the bold score, customer and associate, with the appointment date
- the customer's exact comment in italics, inside quotes
- **Customer Information**: name, phone, store and city, associate, Job ID
- the request: contact the customer, review the feedback with the associate, and send back what was done
- **Thank You,** and your signature

**Where the fields come from:**

| Field | Source |
|---|---|
| Score and comment | The Tracker. The comment is the original text, not the redacted one. |
| Store and city | The store list. |
| SM name | The follow-up file's SM column for that survey, or else the store's most recent SM. |
| Associate, Job ID, appointment date | The appointment file. Job ID can also come from Medallia `Project number`. |
| Customer name and phone | The appointment file or the Medallia export, when either carries them. |

**When a field is missing:**

- It shows as a yellow **[placeholder]**, and the composer lists it.
- Type it into the composer. Your entries are saved for that survey.
- The middle sentence of the request follows the root cause. For example, a completion gap reads "determine what prevented the requested services from being completed", and appointment management reads "determine what caused the scheduling or arrival issue".
- You can rewrite the request for one email in the composer.

**Copying:**

- **Copy for Outlook** puts formatted text on the clipboard (bold, italics, bullets), so pasting into a new message keeps the layout.
- **Copy subject** and **Copy plain text** are also there.
- After a copy, the row shows "Copied <date>".

**Changing the defaults:** edit the default subject, request wording and signature in **Settings › Store manager email**. The logo isn't included, because Outlook adds it from your own signature.

The code is in `src/writing/smEmail.ts`, and the per-root-cause wording is in `THEME_ASK`.

## Week in progress

**Command Center** opens with the fiscal week of the latest survey ("FW43 so far · Nov 21–Nov 23 (3 days)"): LTR so far with n, the 0–8 count, the same days of last week, and how many 0–8 scores the week can still take at a typical week's volume (average of the 4 weeks before) and finish at 93. It follows the geography filters. `src/analytics/weekToDate.ts`.

## Subscriptions

**Subscriptions** (Report) shows FYTD net subscriptions and the in-store share, the current week to date, completed appointments and surveys per 100 completed appointments; a weekly online / in-store chart; the stores with the most in-store subscriptions (this week, 4 weeks, FYTD; exportable); a store-set table (stores with no completed appointments sell but don't service); and **Subscriptions and LTR**:

- LTR by quarter of stores ranked by in-store share (stores with ≥ 10 surveys), plus the same split *within* each region so region mix can't explain it.
- LTR in store-weeks with a *Follow Up Required* (or an *Exception*) vs without.
- By region: new subscriptions per completed appointment vs LTR (rank correlation).

**Pace vs last week** (Subscriptions screen and Daily Pulse): "On pace to beat / Behind pace for FW(n−1)'s total", the projected week total, and how many more are needed to beat last week (total and per remaining day). With the export from 7 days earlier loaded, the projection follows last week's own pattern (last week's total × this week to date ÷ last week at the same point); otherwise it is straight-line (week to date ÷ days × 7) and says so.

**Weekly chart average:** a line for the average to date (mean of completed weeks through each week) or a 4-week average (toggle). Weeks below the line are red; the week in progress is faded, judged by its projected total, and never moves the line.

Each comparison says whether the gap is bigger than 2 standard errors ("bigger than chance alone would explain") or a hint. They are store-level patterns, not member-level proof. `src/analytics/subscriptions.ts`, tested in `subscriptions.test.ts`.

## Daily Pulse and Presentation mode

- **Daily Pulse:** pick the meeting date. Tuesday–Friday covers yesterday; Monday covers the weekend.
  - The cards show the surveys that came in, every 0–8 with store and theme, damage/safety comments, the fiscal week so far, and subscriptions (yesterday, week to date, same point last week, pace, top in-store stores).
  - The **Pulse script** follows `docs/DAILY_PULSE_PROMPT.md` and is capped at **two minutes** (300 words at 150 a minute):
    - Opening with the date and fiscal week
    - **Customer experience:**
      - yesterday's surveys, promoters and detractors
      - LTR vs the day before
      - week to date vs the same days of last week, vs 93
      - fiscal year to date and the four-week trend
      - a promoter quote, from the redacted text
      - RedVest Associate recognition
      - detractor root causes, and recurring or emerging themes
    - **Subscriptions:**
      - net new yesterday, plus the week and fiscal-year totals
      - pace vs last week, and what's needed per remaining day
      - in-store leaders for yesterday and for the week
    - **Things to watch today:**
      - LTR headroom at 93 and the theme to watch
      - subscription pace and momentum
      - today's appointments from the appointment file, or a note that none is loaded
      - operational items: damage, overdue 48-hour follow-ups, no-shows
  - **Fridays** add a **Week recap** for Saturday through Thursday:
    - LTR vs the same days last week and vs 93
    - how many more detractors today can take and still finish at 93
    - the week's top themes, and recognition
    - regions below 93
    - subscriptions vs last week and what's needed today
  - Lines are ranked, and the lowest-priority ones are dropped until the script fits two minutes; the page says how many were dropped.
  - Anything not loaded is said plainly, never guessed.
  - Key numbers are **bold**. **Copy for Teams/Outlook** keeps the bold and bullets; **Copy text** is plain.
  - **Edit** lets you change the script (use `**double asterisks**` for bold). Edits are saved per date, and every number you type is checked against the data.
- **Leadership questions log** lives on **LTR Slide**: questions logged at a WBR open the next week's talk track (“Last week I was asked about…”), each answered from that week's data, until marked answered. Answers pinned from **Ask** go to the slide's Back pocket.
- **Presentation mode** (nav → Present): hides navigation, filters, edit controls and “Show original”; larger type; ← → move between screens; Esc exits.

## No AI, no network

There is no AI provider: the work laptop has no API key or approved gateway, so the AI layer in the brief was replaced by local equivalents.

- **Ask** turns a question into filters (weeks, region/district/store, theme, thresholds) and an intent (why LTR moved, regions below benchmark, what's new, LTR, detractors, attributes, stores, comment themes), computes the answer from the loaded data and shows a **Data used** panel. If the data isn't loaded it says so; unrecognised questions get examples, never a guess.
- **Writing** (the what-changed summary, the LTR slide talk track and the pulse script) is generated from the computed facts, so every number comes from the data. A **number checker** flags any figure in edited text that doesn't match (percentages must match percentages).
- The page's content-security policy blocks all outbound connections (`connect-src 'self' data: blob:`).

## Known issue: SheetJS version

The app uses `xlsx` 0.18.5 from npm, which has two published advisories (prototype pollution and ReDoS when parsing a *maliciously crafted* file). The risk here is low (only your own exports are opened, parsing runs in a worker, and the page can't reach the network), but the fixed version is only distributed by SheetJS. On a machine that can reach it:

```bash
npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz && npm test && npm run build
```

## Calculation notes

- Multi-week figures (FYTD, 4-week average, months, quarters, rolling 4-week) **pool counts** (promoters ÷ n); they never average weekly percentages.
- Compare-to: *prior week* = FW−1; *4-week avg* = pooled FW−4…FW−1; *FYTD* = pooled FW1…FW.
- Colour appears only when n ≥ the “No trend” threshold (default 5). Heat cells use a blue/orange diverging scale centred on the benchmark, and every cell also says “above”/“below”.
- Attributes use per-survey answers when loaded (so geography filters apply); otherwise the Medallia Analytics weekly values (company-wide only).
- Charts never use two y-scales: the n panel under the LTR line has its own axis.
- A detractor is “overdue” when there is no documented SM contact 48+ hours after the survey date.

## Demo data

**Data Manager → Demo source files** downloads 6 synthetic files shaped like the real exports (Tracker header on row 3 with ~300 columns, Medallia exports, commentary, follow-up file, store mapping, fake PII in a comment) to try the uploader end to end. Importing them reproduces the same baselines.

**Data Manager → Load demo data** generates synthetic, clearly labelled DEMO records (seeded, deterministic) that reproduce the real baselines: FW40 LTR 94.7% on n=131 (7 detractors, 2 at 0–6), FYTD 93.1% on n=3,736, R5 and R27 below 93, Ease of scheduling the lowest attribute at 87.4%, and so on. `src/demo/generate.test.ts` checks every baseline.

## Project layout

```
src/
  lib/          dates, fiscal calendar, LTR rules, seeded RNG
  domain/       types, taxonomy, attributes, geography
  tagging/      keyword rules engine, runner, taxonomy store, manual overrides
  slide/        LTR slide metrics, layout, map painting, talk track, PPTX builder, questions log
  writing/      what-changed summary, daily pulse (spec: docs/DAILY_PULSE_PROMPT.md), SM email; number verification
  ask/          local question planner + answers (no AI)
  analytics/    LTR pooling, compare baselines, grains, attributes, detractors, theme mentions, headline (pure, tested)
  db/           Dexie schema, backup/restore, queries
  ingest/       file detection, parsing, redaction, validation, commit (worker + pure functions)
  demo/         demo generator and loader
  state/        settings (persisted), URL-hash filters, UI state
  components/   layout shell (nav, filter bar, command palette) and UI primitives
  pages/        one file per screen
```

## LTR Slide (weekly view)

One 1920×1080 slide, scaled to fit, for the weekly LTR readout (route `#/slide`, nav → Deliver → LTR Slide). The calculations live in `src/slide/ltrMetrics.ts`, and `src/slide/ltrMetrics.test.ts` reproduces the FW41 values from the slide spec with a synthetic fixture (`src/slide/fw41Fixture.ts`). They have also been checked against the real LTR_Tracker1123.

| Element | Rule |
|---|---|
| KPIs | Week LTR, change vs last week, vs the 93 benchmark, regions at or above 93 (unrounded), count scored 0–8. With **Show allowance** on (off by default), the count shows the allowance: floor(n × 0.07). |
| Rounding and colour | Whole numbers round half up from one decimal (94.49 → 94.5 → 95). Colours use the unrounded value (FW38 92.55 shows 93 in red). Changes = rounded − rounded. ▲ is black, ▼ is red. |
| Map | Uses the Tracker's “LTR Region Map” sheet: the base picture plus one picture per region. Each region is filled green (≥ 93), yellow (< 93) or grey (n < 5). Picture → region and region → division are set in **Settings → LTR slide**. Until a Tracker with that sheet is imported, a tile placeholder is shown. |
| Callouts (6) | Suggested in this order: the 2 regions with the most 0–8 scores (n ≥ 10), the biggest drop (n ≥ 10), up to 2 low-count drops (n < 10, asterisked), 1 bright spot (biggest gain that is now ≥ 93). A region that moved on one low score with n < 12 is held back unless a slot is open. Categories (SCOPE / EXECUTION / CONFIRMING) come from comment tags, with Medallia topics as hints. All are editable and saved per week. |
| Trend | Last 4 weeks. Bars = 0–8 count (left axis), blue if the week's LTR ≥ 93, otherwise red. The line = LTR (right axis). A dashed line marks the 93 benchmark. This deliberately uses two axes, as the slide spec asks. |
| Divisions | South, West, North, from the region config. |
| Key Drivers | Medallia Analytics % 9–10 for the week (falls back to per-survey answers). Which attributes appear, and their short names, are set in Settings. |
| Cards | Medallia buckets: Promoters 9–10, Passives 7–8, Detractors 0–6. Drivers and bullets are drafted from comment tags and can be edited. |
| Exports | .pptx: native text, a native bar+line combo chart, a native drivers chart, the map as a picture, and the talk track in the speaker notes (in slide order, then a “Back pocket”), with no comment parts so it opens on iPad. Also PNG at 3840×2160 and a JSON snapshot (saved per week in IndexedDB and downloaded). |
| YTD | Shows, in order of preference: a value typed in under “Edit the slide”, then a Medallia Analytics export run from the start of the fiscal year through the slide week (its Total column: LTR and Sample Size; month or day columns both work), then the Tracker (FW1 through the slide week). Leadership's YTD (e.g. 93 on 3,629) comes from Medallia's expanded view, which counts differently from the Tracker; the validation panel shows both. |
| Validation panel | Survey count by week, YTD (compare with the Tracker), Tracker vs Medallia week LTR, duplicate appointments (same date = warning; repeat visits = info), regions without surveys, regions missing from the division config, missing Key Drivers. |

## On a phone

Below 768 px wide the app switches to a phone layout: a top bar with the screen name and week, a ☰ menu that slides out, a **Filters** button that opens the filter bar, grids that stack (KPI rows go two-up), and wide tables that scroll inside their own box. Form fields use 16 px text so iOS doesn't zoom when you tap them. On **LTR Slide**, **View full screen** shows the slide filling the phone, turned sideways when the phone is upright. `npm run e2e:phone` checks every screen at iPhone size.

An iPhone can't run a downloaded HTML file (the Files app only previews it, with scripts off), so on an iPhone open the app from a hosted link. Data still stays in that phone's browser storage.

## Quality checklist

Evidence for each item in the brief's checklist. `unit` = Vitest (`npm test`); `e2e` = `npm run e2e`; `a11y` = `npm run e2e:a11y`.

| Item | Status | Evidence |
|---|---|---|
| Demo: FW40 LTR 94.7%, n=131, 7 detractors (2 at 0–6); FYTD 93.1% on 3,736 | ✅ | unit `demo/generate.test.ts`, `analytics/analytics.test.ts`; e2e (both "Load demo data" and importing the demo source files) |
| `fiscalWeek` values, FW40 WBR Nov 11, month 10, Q4 | ✅ | unit `lib/fiscal.test.ts` |
| LTR = 9–10 ÷ valid scores; detractor = 0–8; tests fail if changed | ✅ | unit `lib/ltr.test.ts` (guard tests) |
| Every LTR % shows n (screens, tooltips, exports) | ✅ | `PctN`/KPI cards everywhere; CSV/XLSX add n columns; the LTR slide's drawers and Back pocket give exact % with n |
| No colour where n < 5 | ✅ | `canColor` in heat tables, trend points, region multiples, attribute strip |
| Detractors dated after Friday only in “Next week preview” | ✅ | Detractors screen (FW+1 box); counted only in their own week |
| Tracker header on row 3 / ~300 columns; Loyalty files with mixed sheets, text dates, newline Case # | ✅ | unit `ingest/pipeline.test.ts`, `ingest/tracker.test.ts`; verified on a real FY26 Tracker |
| Same file twice → no duplicates | ✅ | unit + e2e |
| Renamed column → mapping dialog, remembered | ✅ | unit + e2e |
| 10,000 surveys < 3 s without freezing | ✅ | browser: 0.73 s, longest frame gap 19 ms during parsing (worker); writing 12k records afterwards pauses ≤ 0.25 s |
| Redaction: CX/Caller/Spoke with:/Name:, phone formats, emails, order #s, addresses | ✅ | unit `ingest/redact.test.ts` (plus staff names, SM-column names, common first names) |
| Presentation mode and every export contain no unredacted text | ✅ | e2e scans all presentation screens and unzips the downloaded LTR slide PPTX; the demo has a comment with a fake name and phone number to prove it |
| AI payload only redacted text and aggregates | n/a | No AI layer (no access); outbound network blocked by CSP |
| No network requests | ✅ | e2e (zero requests; outbound `fetch` blocked) |
| AI: invalid JSON retry, number verification, “not in the loaded data” | ✅ / n/a | No AI; number verification applies to all generated and edited text (`writing/verify.test.ts`); Ask says “not in the loaded data” (`ask/ask.test.ts`) |
| PPTX opens with editable text, native charts, speaker notes | ✅ | e2e checks the LTR slide file (native combo + drivers charts, talk track) — open it in PowerPoint once to confirm |
| Every screen: loading, empty (names the file), error state | ✅ | `PageGate` + route `ErrorBoundary`; e2e checks every empty state |
| Keyboard navigation; Ctrl+K palette | ✅ | e2e (palette navigation, visible focus, focus moves to content on navigation); drag-reorder has ▲/▼ buttons; Review Queue keys |
| LTR Slide: FW41 values (91, ▼4, −2, 6 of 14, 20 scored 0–8, allowed 15, 198/11/9, divisions 94/89/87, trend colours) | ✅ | unit `slide/ltrMetrics.test.ts`; also checked against the real Tracker 1123 |
| LTR Slide exports: combo chart on a secondary axis, drivers chart, talk track + back pocket, no comment parts, PNG 3840×2160 | ✅ | e2e |
| Daily Pulse: prompt structure, ≤ 2 minutes, Friday week recap, numbers verified on every day of a month | ✅ | unit `writing/pulse.test.ts`, e2e |
| Detractors › Email SM: score, customer, phone, associate, Job ID, exact quote, Customer Information list; copies formatted HTML + plain text | ✅ | unit `writing/smEmail.test.ts`, e2e |
| Phone layout: every screen fits an iPhone with no sideways scrolling; menu drawer; full-screen slide | ✅ | e2e `e2e/phone.cjs` |
| WCAG AA contrast, light and dark (axe) | ✅ | a11y: 15 screens × 2 themes, **no violations of any severity** |
| No console errors/warnings; strict TS; lint; tests | ✅ | e2e console check; `npm run typecheck`, `npm run lint`, `npm test` |
| `npm run build` → one HTML file that opens offline and shows the demo data | ✅ | e2e (file://); startup ≈ 0.3 s |
| README with setup, weekly workflow, changing business rules | ✅ | this file |

Two colour tokens are a shade darker than the brief to pass WCAG AA as text on tinted backgrounds: orange text `#A64D0D` (brief `#B8560F`) and green text `#1A6B4F` (brief `#1F7A5A`). Chart colours are as specified.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | project, shell, routing, filter bar, theme, fiscal calendar, Dexie schema, demo data | ✅ |
| 2 Ingestion | 7 parsers in a Web Worker, fuzzy headers, mapping dialog, redaction, validation report | ✅ |
| 3 LTR core | Command Center, LTR Trends, Regional Drilldown, Detractors, Attributes | ✅ |
| 4 VOC | rules engine, VOC Themes, Review Queue (Contact Center and Cross-Channel later removed) | ✅ |
| 5 Writing & Ask (no AI) | rule-based writing, number verification, local Ask | ✅ |
| 6 Pulse | Daily Pulse, Presentation mode (the WBR Builder was later replaced by the LTR Slide) | ✅ |
| 7 Hardening | accessibility (axe), performance, locked weeks read-only, error boundary, e2e checklist, docs | ✅ |
| 8 LTR Slide | weekly LTR slide, Tracker map extraction, callouts, combo chart, PPTX/PNG/JSON, settings | ✅ |
| 9 Surveys only | calls, WBR Builder and Cross-Channel removed; survey Daily Pulse; one-time cleanup of stored call data; phone layout | ✅ |
| 11 Subscriptions | subscription export import with daily snapshots, Subscriptions screen, subscriptions in the Daily Pulse, faster Excel reading (display formatting off) | ✅ |
| 10 Filters & insights | Division and Associate filters, appointment file import, restated-week handling, LTR points per theme, services members want added | ✅ |
