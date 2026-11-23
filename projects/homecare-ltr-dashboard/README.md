# HomeCare+ LTR & Customer Intelligence Dashboard

A local, single-page analytics app for HomeCare+ LTR reporting, Voice of the Customer (Medallia survey comments) and Contact Center (Loyalty Case) analysis, the Wednesday WBR slide and the daily pulse.

- Runs entirely on your laptop. No server, no login, no telemetry, no CDNs.
- Data lives in this browser's IndexedDB. Export or import a JSON backup from **Data Manager**.
- `npm run build` produces **one self-contained HTML file** (`dist/index.html`). Double-click it to open it offline.

> **Status:** phase 1 of 7 (Foundation) is complete. See [Build status](#build-status).

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

## Demo data

**Data Manager → Load demo data** generates synthetic, clearly labelled DEMO records (seeded, deterministic) that reproduce the real baselines: FW40 LTR 94.7% on n=131 (7 detractors, 2 at 0–6), FYTD 93.1% on n=3,736, 340 calls / 309 cases (+36 associate/store), 41 cancellations (18 from exclusions) and so on. `src/demo/generate.test.ts` checks every baseline.

## Project layout

```
src/
  lib/          dates, fiscal calendar, LTR rules, seeded RNG
  domain/       types, taxonomy, attributes, geography
  db/           Dexie schema, backup/restore, queries
  demo/         demo generator and loader
  state/        settings (persisted), URL-hash filters, UI state
  components/   layout shell (nav, filter bar, command palette) and UI primitives
  pages/        one file per screen
```

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | project, shell, routing, filter bar, theme, fiscal calendar, Dexie schema, demo data | ✅ done |
| 2 Ingestion | 7 parsers in a Web Worker, fuzzy headers, mapping dialog, redaction, validation report | next |
| 3 LTR core | Command Center, LTR Trends, Regional Drilldown, Detractors, Attributes | |
| 4 VOC & calls | rules engine, VOC Themes, Contact Center, Cross-Channel, Signal Register, Review Queue | |
| 5 AI layer | provider settings, tagging, writing, Ask, number verification | |
| 6 WBR & pulse | WBR Builder, questions log, PPTX export, Daily Pulse, Presentation mode | |
| 7 Hardening | performance, accessibility, quality checklist, weekly workflow docs | |
