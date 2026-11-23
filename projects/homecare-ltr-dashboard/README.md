# HomeCare+ LTR & Customer Intelligence Dashboard

A local, single-page analytics app for HomeCare+ LTR reporting, Voice of the Customer (Medallia survey comments) and Contact Center (Loyalty Case) analysis, the Wednesday WBR slide and the daily pulse.

- Runs entirely on your laptop. No server, no login, no telemetry, no CDNs.
- Data lives in this browser's IndexedDB. Export or import a JSON backup from **Data Manager**.
- `npm run build` produces **one self-contained HTML file** (`dist/index.html`). Double-click it to open it offline.

> **Status:** phases 1–6 of 7 are complete (phase 5 built without AI — see below). See [Build status](#build-status).

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: business rules, fiscal calendar, demo baselines
npm run lint
npm run build      # → dist/index.html (single file, works from file://)
```

Requires Node 20+.

## Business rules (where they live)

| Rule | File | Guarded by |
|---|---|---|
| LTR % = 9–10 ÷ all valid 0–10 scores (not NPS) | `src/lib/ltr.ts` | `src/lib/ltr.test.ts` |
| Detractor = 0–8; secondary split 0–6 / 7–8 | `src/lib/ltr.ts` | `src/lib/ltr.test.ts` |
| Sample-size flags (<5 No trend, 5–9 Directional, ≥30 Strong); no color when n<5 | `src/lib/ltr.ts` (thresholds editable in Settings) | `src/lib/ltr.test.ts` |
| Benchmark 93% | Settings | — |
| FY26 4-5-4 calendar, Sat–Fri weeks, FW1 = 2026-01-31, WBR = week end + 5 days | `src/lib/fiscal.ts` (FY start editable in Settings) | `src/lib/fiscal.test.ts` |
| Theme taxonomy, keyword rules, default status | `src/domain/taxonomy.ts` (Settings editor in phase 4) | phase 4 |
| Regions, store/district normalisation | `src/domain/geo.ts` | `src/domain/geo.test.ts` |

**Changing a rule:** edit the file, update its test, and run `npm test`. The LTR and detractor guard tests are written to fail if either rule changes, on purpose.

## Uploading files (Data Manager)

Drop any mix of files on **Data Manager**. Each one is read in a Web Worker, so the UI never freezes, and detected from its sheet names and headers:

| File | Detected by | Notes |
|---|---|---|
| LTR Tracker (`LTR_Tracker*.xlsx`) | sheet `Export Data`, header found on row 3 | ~330 columns from all Lowe's survey programs; uses Surveyid, Lowe's Region, Store # (+ `Store` for city/state), Date Only, Appointment ID, Likelihood to Recommend (col “Likelihood to Recommend”, which equals the HomeCare+ LTR question wherever both are filled), ` Score`, FW # and the HomeCare+ comment. **Attributes are never taken from the Tracker** (its similarly named columns belong to other programs). Also reads the hidden `Servicing Selling Stores` (store → district), `Detractors` (SM follow-up) and `Fiscal Calendar` (checked against the app's calendar) sheets; other sheets are not converted, which keeps a 20 MB Tracker to ~2–3 s. Formula-only rows are ignored. |
| Medallia Responses export | header on row 2 | Adds comments and the nine attributes. Merged into the matching Tracker survey (by ID, appointment, or date+store+score); never counted in LTR. |
| Medallia Analytics driver report (`Analytics - <timestamp>.xlsx`) | rows = measures, columns = days (`14 Sat` … `20 Fri`, `Total`, `Benchmark`) or weeks (`FW40`); a long `FW, Attribute, Top 2 Box %, n` layout also works | Day columns are dated from the export timestamp in the file name and rolled up to fiscal weeks weighted by each day's Sample Size (this reproduces Medallia's Total). Medallia labels map to the nine attributes (Project Value → Value for money, Ease of Process → Ease of process prior, Amount of Time… → Time to get an appointment, …). n = Sample Size. The LTR row is cross-checked against the Tracker; Benchmark is ignored. |
| Customer Commentary | header on row 2; `date, score, comment` | Fills comments on matching Tracker surveys. |
| Loyalty Cases | `Call Date, Call Driver, Case #, Case Notes` | Any sheet name, real or text dates, Case # newlines trimmed. You choose the week to import into; rows dated outside it are dropped and counted. |
| Detractor follow-up (`FW40.xlsx`, or the Tracker's `Detractors` tab) | `LL, Score, Comment, Store, SM, Insights, Region, FW, FQ, FP` (header on row 1) | Insights → **Documented** only when contact with the member is described (called, contacted, spoke, left a voicemail, “customer confirmed…”); emails, plans (“I will call…”, “store asked to contact…”) and internal reviews/coaching → **Email only**; blank → **Missing**; detractors absent from the file → **Missing**. Names in the SM column are redacted wherever they appear. FQ/FP are checked against the calendar. |
| Store→District CSV | `Store #, Store Name, City, State, District, Region` | Also uploadable from Settings. |

Headers are matched fuzzily (case, spaces, curly quotes). If a required column isn't found, the **column-mapping dialog** opens; the mapping is remembered for future uploads. Re-uploading a file never duplicates records (deterministic IDs). Locked weeks are read-only.

Each import produces a **validation report**: rows read/kept/dropped and why, dates found vs the selected week, duplicate cases, Call Driver typo mapping, Score vs LTR disagreements, the Tracker non-promoter count vs the follow-up file (naming missing surveys), unmapped stores, and redaction counts.

**Source of truth:** LTR is computed only from Tracker rows (`Likelihood to Recommend`; the `Score` column is checked against it and disagreements are listed).

## Privacy

- On import, comments, call notes and SM insights pass through a **redaction** step: emails, order numbers (12+ digits), US phone numbers, street addresses, names after `CX`, `Caller`, `Spoke with:`, `Name:`, `Mr/Mrs/Ms`, names after `Store Manager`/`SM`/`technician`/`associate`, “First Last” before an action verb (“… reviewed”, “… contacted”), every name listed in a follow-up file's SM column, and ~900 common US first names bundled locally (words that are also ordinary words — Will, Mark, May, Bill, Jack… — are excluded). Remaining capitalised words after “with/by/tech/associate” mark the record *uncertain* for the Review Queue. “No Comment”-style placeholders are treated as blank. Rules are editable in **Settings → Redaction rules** (with a test box).
- Original text is stored only in IndexedDB (`originals` table). The UI shows redacted text; "Show original" relocks after 60 s and is unavailable in Presentation mode.
- Text where PII may remain (e.g. "spoke with bob jones") is flagged for the Review Queue.
- Phone numbers are hashed with a per-install salt (for repeat-caller detection) and never displayed.
- The JSON backup contains original text — keep it on the work laptop.

## Theme tagging (rules engine)

Every survey comment and customer call is tagged on import (and on **Data Manager → Re-run tagging**) with one primary theme, up to 3 secondary themes, sentiment and a confidence; calls also get sub-tag, contact type (Avoidable / Deflectable / Necessary), cancellation and escalate flags. Tags show their source: **Rule**, **AI** (phase 5) or **Manual**. Manual tags are never overwritten.

- Keyword rules live in **Settings → Theme taxonomy** (phrases, `word*`, `/regex/`; single words also match plurals), with a test box.
- Primary precedence: safety/damage > failed experience > service demand > specific praise > general praise. Positive mentions of scheduling or value are general praise; associate praise vs concern is judged on the associate words.
- Never inferred from the score, Medallia topic tags or blank comments (“No Comment” counts as blank). Associate/store help-desk calls are never tagged.
- Calls are themed from *Problem / Reason for Calling* only; *Completed Actions* gives outcomes (cancellation processed vs requested, 30-day window, refund processed vs requested vs none).
- A cancellation means the subscription (not an appointment auto-cancel); a cancellation whose reason mentions an exclusion is “Exclusion drove cancel”.
- Confidence < 0.7 → **Review Queue** (keys 1–9 / Enter / S); overrides can add the deciding phrase to the rules.
- Evidence maturity (last 4 weeks): Emerging = 1 week, Repeated = 2+ weeks, Corroborated = both channels, Validated = set in the Signal Register.

On the demo data the rules reproduce every baseline exactly; on a real FY26 Tracker about 8% of comments land in the Review Queue.

## WBR Builder and Daily Pulse

- **WBR Builder** drafts the “Customer Insights FWxx” slide from the week's data: subtitle with LTR and n, up to 6 theme rows (`Theme: X mentions · Y calls · Z surveys` + a one-line insight with a live 85-character counter), the detractor callout, the “Top VOC Mentions” stacked chart (surveys vs calls, sorted, y-axis rounded above the top bar) and a sources/n footnote. Drag or ▲/▼ to reorder; every line is editable and saved per week; numbers that don't match the data are flagged.
- **Pre-flight** must pass (or be overridden with a reason) before export: line length, numbers verified, LTR % with n, PII scan of slide + notes, week's data loaded, calls cover Sat–Fri, Review Queue cleared, last week's questions answered.
- **Exports:** one editable 16:9 .pptx (native text, native chart, speaker notes), slide text, chart data, chart PNG at 2×. A test unzips the .pptx and scans every part for unredacted text.
- **Leadership questions log:** questions logged at a WBR open the next week's speaker notes (“Last week I was asked about…”), each answered from that week's data, until marked answered.
- **Daily Pulse:** pick the meeting date (Monday covers the weekend); calls and top drivers, new detractors, damage/safety, cancellations, one thing to watch, and an editable ~60-second script with a large-type reading view.
- **Presentation mode** (nav → Present): hides navigation, filters, edit controls and “Show original”; larger type; ← → move between screens; Esc exits.

## No AI, no network

There is no AI provider: the work laptop has no API key or approved gateway, so the AI layer in the brief was replaced by local equivalents.

- **Ask** turns a question into filters (weeks, region/district/store, theme, channel, thresholds) and an intent (why LTR moved, regions below benchmark, cancellations, what's new, LTR, detractors, attributes, stores, themes, calls), computes the answer from the loaded data and shows a **Data used** panel. If the data isn't loaded it says so; unrecognised questions get examples, never a guess.
- **Writing** (slide theme lines ≤ 85 characters, the LTR callout, what-changed summary, speaker notes) is generated from one `weekFacts` object, so every number comes from the data. A **number checker** flags any figure in edited text that doesn't match (percentages must match percentages).
- The page's content-security policy blocks all outbound connections (`connect-src 'self' data: blob:`).

## Calculation notes

- Multi-week figures (FYTD, 4-week average, months, quarters, rolling 4-week) **pool counts** (promoters ÷ n); they never average weekly percentages.
- Compare-to: *prior week* = FW−1; *4-week avg* = pooled FW−4…FW−1; *FYTD* = pooled FW1…FW.
- Colour appears only when n ≥ the “No trend” threshold (default 5). Heat cells use a blue/orange diverging scale centred on the benchmark, and every cell also says “above”/“below”.
- Attributes use per-survey answers when loaded (so geography filters apply); otherwise the Medallia Analytics weekly values (company-wide only).
- Charts never use two y-scales: the n panel under the LTR line has its own axis.
- A detractor is “overdue” when there is no documented SM contact 48+ hours after the survey date.

## Demo data

**Data Manager → Demo source files** downloads 12 synthetic files shaped like the real exports (header on row 3, ~300 columns, mixed sheet names, text dates, newline Case #s, day-before rows, fake PII) to try the uploader end to end. Importing them reproduces the same baselines.

**Data Manager → Load demo data** generates synthetic, clearly labelled DEMO records (seeded, deterministic) that reproduce the real baselines: FW40 LTR 94.7% on n=131 (7 detractors, 2 at 0–6), FYTD 93.1% on n=3,736, 340 calls / 309 cases (+36 associate/store), 41 cancellations (18 from exclusions) and so on. `src/demo/generate.test.ts` checks every baseline.

## Project layout

```
src/
  lib/          dates, fiscal calendar, LTR rules, seeded RNG
  domain/       types, taxonomy, attributes, geography
  tagging/      keyword rules engine, runner, taxonomy store, manual overrides, WBR pins
  wbr/          slide draft, pre-flight checks, speaker notes, PPTX builder
  writing/      rule-based slide lines, callout, what-changed, speaker notes; number verification
  ask/          local question planner + answers (no AI)
  analytics/    LTR pooling, compare baselines, grains, attributes, detractors, theme mentions, headline (pure, tested)
  db/           Dexie schema, backup/restore, queries
  ingest/       file detection, parsing, redaction, validation, commit (worker + pure functions)
  demo/         demo generator and loader
  state/        settings (persisted), URL-hash filters, UI state
  components/   layout shell (nav, filter bar, command palette) and UI primitives
  pages/        one file per screen
```

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | project, shell, routing, filter bar, theme, fiscal calendar, Dexie schema, demo data | ✅ done |
| 2 Ingestion | 7 parsers in a Web Worker, fuzzy headers, mapping dialog, redaction, validation report | ✅ done |
| 3 LTR core | Command Center, LTR Trends, Regional Drilldown, Detractors, Attributes | ✅ done |
| 4 VOC & calls | rules engine, VOC Themes, Contact Center, Cross-Channel, Signal Register, Review Queue | ✅ done |
| 5 Writing & Ask (no AI) | rule-based writing, number verification, local Ask with “Data used”; outbound network blocked | ✅ done |
| 6 WBR & pulse | WBR Builder, questions log, PPTX export, Daily Pulse, Presentation mode | ✅ done |
| 7 Hardening | performance, accessibility, quality checklist, weekly workflow docs | next |
