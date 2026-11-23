# HomeCare+ LTR & Customer Intelligence Dashboard

A local, single-page analytics app for HomeCare+ LTR reporting, Voice of the Customer (Medallia survey comments) and Contact Center (Loyalty Case) analysis, the Wednesday WBR slide and the daily pulse.

- Runs entirely on your laptop. No server, no login, no telemetry, no CDNs.
- Data lives in this browser's IndexedDB. Export or import a JSON backup from **Data Manager**.
- `npm run build` produces **one self-contained HTML file** (`dist/index.html`). Double-click it to open it offline.

> **Status:** phases 1–2 of 7 (Foundation, Ingestion) are complete. See [Build status](#build-status).

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
| LTR Tracker (`LTR_Tracker*.xlsx`) | sheet `Export Data`, header found on row 3 | ~300 columns; uses Surveyid, Region, Market, Store #, Date Only, Appointment ID, Likelihood to Recommend, Score, FW #, HomeCare+ comment. Also reads `Servicing Selling Stores` / `Region Divison` (store→district) and `Detractors` (SM notes) when they have those columns. |
| Medallia Responses export | header on row 2 | Adds comments and the nine attributes. Merged into the matching Tracker survey (by ID, appointment, or date+store+score); never counted in LTR. |
| Medallia Analytics driver report | `FW, Attribute, Top 2 Box %, n` or one column per week (`FW40`) | Weekly top-2-box per attribute. |
| Customer Commentary | header on row 2; `date, score, comment` | Fills comments on matching Tracker surveys. |
| Loyalty Cases | `Call Date, Call Driver, Case #, Case Notes` | Any sheet name, real or text dates, Case # newlines trimmed. You choose the week to import into; rows dated outside it are dropped and counted. |
| Detractor follow-up (`FW40.xlsx`) | `LL, Score, Comment, Store, SM, Insights, …` | Insights classified Documented / Email only; detractors absent from the file are Missing. |
| Store→District CSV | `Store #, Store Name, City, State, District, Region` | Also uploadable from Settings. |

Headers are matched fuzzily (case, spaces, curly quotes). If a required column isn't found, the **column-mapping dialog** opens; the mapping is remembered for future uploads. Re-uploading a file never duplicates records (deterministic IDs). Locked weeks are read-only.

Each import produces a **validation report**: rows read/kept/dropped and why, dates found vs the selected week, duplicate cases, Call Driver typo mapping, Score vs LTR disagreements, the Tracker non-promoter count vs the follow-up file (naming missing surveys), unmapped stores, and redaction counts.

**Source of truth:** LTR is computed only from Tracker rows (`Likelihood to Recommend`; the `Score` column is checked against it and disagreements are listed).

## Privacy

- On import, comments, call notes and SM insights pass through a **redaction** step: emails, order numbers (12+ digits), US phone numbers, street addresses, and names after `CX`, `Caller`, `Spoke with:`, `Name:`, `Mr/Mrs/Ms`. Rules are editable in **Settings → Redaction rules** (with a test box).
- Original text is stored only in IndexedDB (`originals` table). The UI shows redacted text; "Show original" relocks after 60 s and is unavailable in Presentation mode.
- Text where PII may remain (e.g. "spoke with bob jones") is flagged for the Review Queue.
- Phone numbers are hashed with a per-install salt (for repeat-caller detection) and never displayed.
- The JSON backup contains original text — keep it on the work laptop.

## Demo data

**Data Manager → Demo source files** downloads 12 synthetic files shaped like the real exports (header on row 3, ~300 columns, mixed sheet names, text dates, newline Case #s, day-before rows, fake PII) to try the uploader end to end. Importing them reproduces the same baselines.

**Data Manager → Load demo data** generates synthetic, clearly labelled DEMO records (seeded, deterministic) that reproduce the real baselines: FW40 LTR 94.7% on n=131 (7 detractors, 2 at 0–6), FYTD 93.1% on n=3,736, 340 calls / 309 cases (+36 associate/store), 41 cancellations (18 from exclusions) and so on. `src/demo/generate.test.ts` checks every baseline.

## Project layout

```
src/
  lib/          dates, fiscal calendar, LTR rules, seeded RNG
  domain/       types, taxonomy, attributes, geography
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
| 3 LTR core | Command Center, LTR Trends, Regional Drilldown, Detractors, Attributes | next |
| 4 VOC & calls | rules engine, VOC Themes, Contact Center, Cross-Channel, Signal Register, Review Queue | |
| 5 AI layer | provider settings, tagging, writing, Ask, number verification | |
| 6 WBR & pulse | WBR Builder, questions log, PPTX export, Daily Pulse, Presentation mode | |
| 7 Hardening | performance, accessibility, quality checklist, weekly workflow docs | |
