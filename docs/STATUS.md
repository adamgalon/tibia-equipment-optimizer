# Project status

**Updated:** 2026-10-13  
**Current step:** 1 — item catalog and comparison (done)  
**Plan and stack:** see `decisions/0002-static-app-and-five-step-plan.md`

## Steps

| Step | Scope | Status |
| --- | --- | --- |
| 0 | Research, data feasibility, source verification | Done (2026-10-12, verified and corrected 2026-10-13) |
| 1 | Repository, item importer, item browser and side-by-side comparison, tests, CI, GitHub Pages | Done |
| 2 | Build editor: 10 slots, totals, forge tier and imbuement inputs, saved builds | Next |
| 3 | Hunt advisor: creature damage elements, protection per slot, attack element | Not started |
| 4 | Prices and budget: community/manual prices per world, upgrade per gold | Not started |
| 5 | Experience and loot per creature and hunting place | Not started |

## Step 1 outcome

- `scripts/import-items.ts` imports 1,634 equipment items from TibiaWiki in about 200 requests and writes `data/items.json`. Each item keeps its wiki page and revision.
- The site filters by vocation, slot, level and elemental protection, sorts by level, armor, defense, attack or protection, and compares up to 4 items with the best value per row highlighted. Comparisons are shareable through the URL.
- English and Polish UI.
- Verification: 17 unit tests (parser, comparison rules, translation completeness), typecheck and production build pass. Screenshots were checked at desktop and phone (390 px) widths, in both languages.

## Known gaps

- Unparsed item effects are shown as text, not compared numerically: perfect shot, cleave, magic shield capacity, faster regeneration, spell augments.
- Weapon Proficiency perks are not imported yet (step 2/3).
- On phones the item list scrolls sideways; a card layout could replace the table later.
- The Polish translation has not been reviewed by a native speaker.

## Earlier research

`architecture.md`, `data-sources.md` and `decisions/0001-phase-00-research.md` hold the Phase 00 research. Their data-source rules still apply; the stack and phase plan are superseded by ADR 0002.
