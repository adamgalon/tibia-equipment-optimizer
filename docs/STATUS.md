# Project status

**Updated:** 2026-10-13  
**Current step:** all five steps are done, and the first round of known gaps is closed  
**Plan and stack:** see `decisions/0002-static-app-and-five-step-plan.md`

## Steps

| Step | Scope | Status |
| --- | --- | --- |
| 0 | Research, data feasibility, source verification | Done (2026-10-12, verified and corrected 2026-10-13) |
| 1 | Repository, item importer, item browser and side-by-side comparison, tests, CI, GitHub Pages | Done |
| 2 | Build editor: 10 slots, totals, forge tier and imbuement inputs, saved builds | Done (Weapon Proficiency perks moved to a later step) |
| 3 | Hunt advisor: creature damage elements, protection per slot, attack element | Done |
| 4 | Prices and budget: community/manual prices per world, upgrade per gold | Done |
| 5 | Experience and loot per creature and hunting place | Done |

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
- Imbuements: the importer also reads the 69 `Infobox Imbuement` pages into `data/imbuements.json` (Featherweight is skipped; it only fits containers). Each item offers as many imbuements as it has slots, following the TibiaWiki Imbuing page rules: one imbuement of each type, one elemental damage imbuement at most, and none for a stat the item already has (elemental damage, protection, skill or speed), except Swiftness on Pair of Soulwalkers and Pair of Soulstalkers.
- The current build and named saved builds are kept in browser storage and checked on load: unknown items, tiers above the cap and imbuements that no longer fit are dropped. Builds saved before forge tiers still load.
- Verification: 30 unit tests, typecheck and production build pass. Checked in headless Edge at 1280 px (English) and 390 px (Polish) with a forged and imbued level-400 knight build, including imbuements the rules must refuse; totals were checked by hand.

## Step 3 outcome (2026-10-13)

- The importer also reads the `Infobox Creature` pages into `data/creatures.json`: 1,769 creatures, 1,294 of them with damage data. Removed, event-only and test-server creatures are skipped, as are pages with no hit points, damage or experience; bosses whose hit points are "?" are kept when they list damage. The file loads after the first paint as its own chunk (46 KB gzipped).
- Highest damage per element comes from the wiki's `{{Max Damage}}` breakdown, else from the strongest listed ability of each element (poison counts as earth). Damage taken per attack element comes from the `<element>DmgMod` fields.
- Hunt advisor: pick up to 8 creatures (exact name, or the first name starting with the text). It shows the hardest hit per element with your build's protection and the damage left, the attack elements by average damage taken, and the top 3 items per slot by how much of the damage mix they block on their own (each protection weighted by its element's share of the hardest hits). "Wear" puts an item into the build. The chosen creatures are kept in browser storage.
- Parser fix: infoboxes are now read by matching braces instead of stopping at the first line that starts with `}}`. That recovered Crypt Bile, whose infobox closes on the same line; the same import also picked up 3 items new on the wiki (Ink Sword, Moonsilver Axe, Stellar Moonsilver Axe).
- Verification: 40 unit tests, typecheck and production build pass. Checked in headless Edge at 1280 px (English) and 390 px (Polish) with Brachiodemon and Demon against a knight level 400 build, including the "Wear" button; the table values were checked by hand.

## Step 4 outcome (2026-10-13)

- Decision (owner, 2026-10-13): community prices plus the player's own, as ADR 0002 planned. Tibia Market is the only public per-world source; its data comes from a bot that drives the game client (see `data-sources.md`, finding 4), so it is opt-in, labelled, and always overridable.
- Nothing is sent to Tibia Market until the player clicks "Load community prices" and picks a world. The browser then reads `world_data` and one `market_values` list for that world (~5,000 entries, ~1,200 of them catalog items) and keeps them for an hour (world names for a day). The API allows about one request per 5 seconds; a 429 is retried once. Entries are validated before use.
- Each price is the 30-day average sale price, else the cheapest sell offer, shown with its type and age. Own prices are typed per world in players' shorthand ("30kk", "850k", "1,200,000") and override the community price.
- The build editor shows each worn item's price and the build value. The hunt advisor shows prices next to the best protection and lists "upgrades per gold": items that block more of the hunt's damage than the worn one, by gain per gold, within an optional budget. Weapons, ammunition and items with charges are left out of that list; items with charges or a wear-out duration are tagged ("5 charges", "60 minutes"). The importer now keeps `charges` and `duration` for that (24 and 141 items).
- Verification: 49 unit tests, typecheck and production build pass. Checked in headless Edge against the live API for Antica: no request before opting in, 1,180 prices loaded, build value checked by hand, own price saved per world, budget filter, no new request after a reload, phone layout in Polish.

## Step 5 outcome (2026-10-13)

- The importer reads the newest `{{Loot2}}` block of each "Loot Statistics:" page (namespace 112) and attaches it to its creature: drops by item ID with the average amount per kill and the item's NPC value (from every object page, wearable or not). 1,258 creatures have loot statistics.
- It also reads the 443 `Infobox Hunt` pages into `data/hunts.json`: city, the wiki's experience and loot ratings (stars, or the words the template maps to stars; 321 places are rated), recommended level for knights, paladins and mages, and the creatures from the page's `{{CreatureList}}` blocks (names matched regardless of case and underscores; 28 names with no creature page are dropped).
- Hunt advisor: pick a hunting place to fill in its creatures (up to 12, the cap is now 12) and see its ratings and recommended levels, with a note that the wiki has no Monk recommendation. A table shows each creature's experience and loot value per kill; each drop counts at the better of its NPC price and the market or own price from step 4.
- Creatures and hunting places load after the first paint as separate chunks (148 KB and 23 KB gzipped).
- Verification: 52 unit tests, typecheck and production build pass. Checked in headless Edge with Claustrophobic Inferno (typed as "claustro"); the table matched the data (Infernal Demon 17,430 experience, 6.64k loot per kill at NPC prices).

## Known gaps closed (2026-10-13)

- Phones: below 640 px the item list shows one card per item, each value labelled by its column, instead of a table that scrolls sideways.
- A warning names the items when no vocation can wear the whole build together (for example a paladin helmet with knight gear).
- "Copy link to this build" puts the build (items, tiers, imbuements, perks) into the link as `#build=<base64url JSON>`; nothing is stored on a server. Opening a link replaces the current build, so the replaced build is kept first under Saved builds as "Before link <date>". The link is checked like stored builds.
- Weapon Proficiency: the importer reads the "Weapon Proficiency Tables" page and `Template:Weapon Proficiency Name` into `data/proficiency.json` (415 tables for 654 weapons; 646 of the 672 current weapons have one). The worn weapon gets one perk choice per proficiency level, saved with the build. Perks that add a skill, magic level, shielding, critical hit chance or extra damage, or life or mana leech count in the totals; conditional perks ("... for auto-attacks", "... against bosses", spell bonuses) are shown but not counted.
- Polish text: a review pass (not by a native speaker) fixed plural agreement ("1 dni temu", "1182 przedmiotów"), typographic quotes, gender agreement and phrasing. Prices now show the date they were seen instead of their age in days, in both languages.
- Verification: 57 unit tests, typecheck and production build pass. Checked in headless Edge: the warning appears and clears, a "+1 Sword Fighting" perk raises the sword total from 22 to 23, a share link opened in a browser with another build loads the shared build with its perk and keeps the other one, and the Polish phone list shows cards without sideways scrolling.

## Second round (2026-10-13)

- `App.tsx` (971 lines) is split into `src/app/helpers.ts`, `useApp.tsx` (state and handlers), `BuildEditor.tsx` and `HuntAdvisor.tsx`; the code was moved, not rewritten.
- Playwright smoke tests (`e2e/smoke.e2e.ts`, `npm run test:e2e`) run in the deploy workflow on the production build at desktop and phone sizes: catalog, build totals, hunt damage with armor, per-hour totals, share link, no sideways scrolling. They never call Tibia Market or TibiaData.
- Character lookup: a name typed above the filters is looked up on TibiaData v4 (only on "Look up"); its vocation and level set the filters, and its world becomes the price world only if community prices are already in use. An unknown name and an outage look the same to the browser (TibiaData's 502 carries no CORS header), so they share one message.
- "You take" now subtracts the build's armor from physical hits after protection, using the average of the wiki's range (floor(t/2) to floor(t/2)*2-1); the wiki's worked example (200 -> 171-174) gives 173.
- Kills per hour: one number, spread evenly over the chosen creatures, gives experience and loot per hour (base experience; creatures without loot statistics add no loot).
- Verification: 59 unit tests, 4 Playwright tests (desktop and phone), typecheck and build pass; the lookup was checked against TibiaData with a real and an unknown character.

## Weekly change note (2026-10-13)

- The Monday data job now writes the commit message from `scripts/summarize-changes.ts`: an exact list of added, removed and changed items, imbuements and creatures (value changes field by field; edits that only moved the wiki revision are counted, not listed), at most 40 lines per file.
- With the repository secret `ANTHROPIC_API_KEY`, Claude (`claude-opus-5-5`, effort `low`, server-side fallback on refusals) writes a short note above the list. Without it, or on any API error, refusal or empty answer, the list is used alone, so the data commit never depends on Claude. Expected cost: a few cents per week.
- Verification: unit tests for the change list; dry run against `HEAD~1` without credentials (fallback path). The Claude call itself has not run yet: no key was available locally.

## Open questions

- Can a weapon with its own life leech (for example Soulcutter, 2%) take Vampirism? TibiaWiki's Imbuing page says no. The app allows it until the owner checks in the game (raised 2026-10-13). If the game says no, add `lifeLeech` back to the blocked stats in `hasOwn` in `src/lib/build.ts` and flip its test.

## Known gaps

- Unparsed item effects are shown as text, not compared numerically: perfect shot, cleave, magic shield capacity, faster regeneration, spell augments.
- Proficiency perk swaps (Summer Update 2026) are not modelled, and conditional perks do not count in the totals.
- Imbuement choices follow each imbuement's own wiki page, which differs from the Imbuing page in places: Powerful Strike is offered on every wand and rod (the Imbuing page names 11), Intricate Epiphany on every helmet (the Imbuing page says mage-only helmets plus 6 exceptions), and fist weapons only get Venom among the elemental damage imbuements.
- Life leech, mana leech and crit from several sources are added together. No wiki page states how they combine.
- Totals count equipment only. The 5% crit chance with 10% extra damage that every character has since Summer Update 2025, and Exaltation Overload event bonuses, are not included.
- Build totals leave out defense (it comes from the shield or weapon, not a sum) and weapon attack; both are shown per item.
- Hunt advisor damage is the highest hit the wiki lists per element; abilities without a number and summons are not counted. "You take" applies protection and, for physical hits, average armor; shield defense and mitigation are not modelled.
- "Best protection" ranks items by their own protections only, without imbuements or forge tiers, and charged items such as Stone Skin Amulet and Might Ring rank high although their charges run out.
- "Attack with" averages each creature equally, whatever its hit points or how many of it a hunt has.
- Per-hour figures spread the player's kills per hour evenly over the chosen creatures, ignoring spawn mixes. Some loot statistics rest on few kills (Infernal Demon: 240), and the wiki's hunting place ratings and levels are community opinions.
- Prices are for the base item: whether Tibia Market tracks forged (tiered) copies separately is unknown, and imbuements are not priced. Community data can be weeks old on some worlds; each price shows its age.
- "Upgrades per gold" counts protection only, so it can suggest an item that loses armor, skills or damage. There is no CSV import of prices; they are typed one by one.
- The Polish text has had a careful review, but not yet by a native speaker.

## Earlier research

`architecture.md`, `data-sources.md` and `decisions/0001-phase-00-research.md` hold the Phase 00 research. Their data-source rules still apply; the stack and phase plan are superseded by ADR 0002.
