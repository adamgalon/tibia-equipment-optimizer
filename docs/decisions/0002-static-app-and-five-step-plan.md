# ADR 0002: Static web app and five-step plan

**Status:** Accepted  
**Date:** 2026-10-13  
**Supersedes:** the stack and phase plan in ADR 0001 (its data-source rules still apply)

## Context

The owner's goal is a place to compare Tibia items and plan gear for more damage, experience and loot, and for surviving hunts. Verification on 2026-10-13 found:

- TibiaWiki, the Tibia Market community API and TibiaData all allow cross-origin browser requests (`Access-Control-Allow-Origin: *`).
- The whole equipment catalog (1,634 items) imports from the TibiaWiki API in about 200 requests and is about 380 KB of JSON (120 KB gzipped in the bundle).
- Wiki creature pages provide maximum damage per element, elemental weakness modifiers, experience and loot tables. That is enough data for the "don't die" and "more damage" features.

## Decisions

1. **Static site, no server or database.** Vite + React + TypeScript, deployed to GitHub Pages from a public repository. The catalog is a JSON snapshot in git; prices (step 4) are fetched by the browser and cached briefly.
2. **Import with a script and keep the snapshot in git.** `scripts/import-items.ts` uses `generator=embeddedin` on `Template:Infobox Object` rather than wiki categories, because newer items such as Amber Kusarigama have no categories. A weekly GitHub Action refreshes it, commits only real changes, and refuses to write the file if fewer than 1,000 items parse.
3. **Item ID is the primary key**, keeping the first ID when the wiki lists several (e.g. inactive and active rings).
4. **English and Polish UI** with a switcher; item names stay English. A test fails if a Polish key is missing.
5. **Five steps:** item compare, build editor, hunt advisor, prices and budget, experience and loot. Each step ships on its own.
6. **Community prices** (step 4) are optional, labelled with their observation time, and can be overridden by the user.

## Consequences

- Hosting is free, and there is no backend to secure or keep running.
- Accounts and cross-device saved builds would need a backend; not planned.
- Hidden from the default list: 182 unobtainable, 4 removed and 7 test-server items (shown with a toggle).
