# Project status

**Updated:** 2026-10-13  
**Current step:** 2 — build editor (done); step 3, the hunt advisor, is next  
**Plan and stack:** see `decisions/0002-static-app-and-five-step-plan.md`

## Steps

| Step | Scope | Status |
| --- | --- | --- |
| 0 | Research, data feasibility, source verification | Done (2026-10-12, verified and corrected 2026-10-13) |
| 1 | Repository, item importer, item browser and side-by-side comparison, tests, CI, GitHub Pages | Done |
| 2 | Build editor: 10 slots, totals, forge tier and imbuement inputs, saved builds | Done (Weapon Proficiency perks moved to a later step) |
| 3 | Hunt advisor: creature damage elements, protection per slot, attack element | Next |
| 4 | Prices and budget: community/manual prices per world, upgrade per gold | Not started |
| 5 | Experience and loot per creature and hunting place | Not started |

## Step 1 outcome

- `scripts/import-items.ts` imports 1,634 equipment items from TibiaWiki in about 200 requests and writes `data/items.json`. Each item keeps its wiki page and revision.
- The site filters by vocation, slot, level and elemental protection, sorts by level, armor, defense, attack or protection, and compares up to 4 items with the best value per row highlighted. Comparisons are shareable through the URL.
- English and Polish UI.
- Verification: 17 unit tests (parser, comparison rules, translation completeness), typecheck and production build pass. Screenshots were checked at desktop and phone (390 px) widths, in both languages.

## Step 2 outcome (2026-10-13)

- Build editor with all 10 slots. Item lists follow the vocation, level and "unobtainable" filters.
- Totals add armor, skills, speed, crit, leech, reflection, mantra and imbuement slots. Protections combine one source after another (TibiaWiki "Formulae", rev 1205374): 10% and 10% give 19%.
- A two-handed weapon and a shield or spellbook cannot be worn together: the newest pick wins and the page says what was taken off. Quivers stay next to two-handed distance weapons (TibiaWiki "Quivers"). Clashing options are marked in the dropdown.
- Forge tier per item, capped by its classification. Totals show Onslaught, Ruse, Momentum and Transcendence chances, raised by the boots' Amplification; the per-tier tables come from the TibiaWiki effect pages and match the wiki's Amplification examples.
- Imbuements: the importer also reads the 69 `Infobox Imbuement` pages into `data/imbuements.json` (Featherweight is skipped; it only fits containers). Each item offers as many imbuements as it has slots, following the TibiaWiki Imbuing page rules: one imbuement of each type, one elemental damage imbuement at most, and none for a stat the item already has (elemental damage, protection, skill, speed or life leech), except Swiftness on Pair of Soulwalkers and Pair of Soulstalkers.
- The current build and named saved builds are kept in browser storage and checked on load: unknown items, tiers above the cap and imbuements that no longer fit are dropped. Builds saved before forge tiers still load.
- Verification: 30 unit tests, typecheck and production build pass. Checked in headless Edge at 1280 px (English) and 390 px (Polish) with a forged and imbued level-400 knight build, including imbuements the rules must refuse; totals were checked by hand.

## Known gaps

- Unparsed item effects are shown as text, not compared numerically: perfect shot, cleave, magic shield capacity, faster regeneration, spell augments.
- Weapon Proficiency perks are not imported yet.
- Imbuement choices follow each imbuement's own wiki page, which differs from the Imbuing page in places: Powerful Strike is offered on every wand and rod (the Imbuing page names 11), Intricate Epiphany on every helmet (the Imbuing page says mage-only helmets plus 6 exceptions), and fist weapons only get Venom among the elemental damage imbuements.
- Life leech, mana leech and crit from several sources are added together. No wiki page states how they combine.
- Totals count equipment only. The 5% crit chance with 10% extra damage that every character has since Summer Update 2025, and Exaltation Overload event bonuses, are not included.
- Build totals leave out defense (it comes from the shield or weapon, not a sum) and weapon attack; both are shown per item.
- With the vocation filter on "All", a build can mix items for different vocations without a warning.
- Saved builds cannot be shared by link or exported yet.
- On phones the item list scrolls sideways; a card layout could replace the table later.
- The Polish translation has not been reviewed by a native speaker.

## Earlier research

`architecture.md`, `data-sources.md` and `decisions/0001-phase-00-research.md` hold the Phase 00 research. Their data-source rules still apply; the stack and phase plan are superseded by ADR 0002.
