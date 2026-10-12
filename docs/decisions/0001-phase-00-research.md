# ADR 0001: Phase 00 research decisions

**Status:** Proposed; awaiting user approval  
**Date:** 2026-10-12; revised 2026-10-13 after source verification (decisions 1 and 4 changed, 9 added)

## Context

The referenced ChatGPT discussion describes an advanced web app for official Tibia, covering all five base vocations including Monk. Requested capabilities are item comparison, full equipment optimization under a budget, spawn matching, hunt simulation, saved builds, pricing/budget planning, Smart Upgrade Advisor, ROI, What-if comparisons, and clear data provenance/confidence.

The active task folder had no application source files and was not a Git repository. A separate Tibia Market Tracker repository exists elsewhere in the Codex workspace, but it is a different product and was not changed or treated as this app. It is a clone of the open-source collector behind the Tibia Market community price API; it gathers prices by automating the official game client, so this project must not run it. This decision record and companion docs are Phase 00 deliverables only.

## Proposed decisions

1. Recommend Next.js, React, and TypeScript. Store the catalog as versioned JSON snapshots in the repository; add PostgreSQL only when accounts, shared builds, or the app's own price history are needed. Keep the UI, server-side data access, optimizer, and source adapters in one repository. Run source imports as a command from that repository, not as a separate microservice.
2. Store normalized catalog/hunt data with source-level provenance and game revision. The UI must show source freshness and confidence. Keep previous snapshots for review and rollback.
3. Use Tibia.com official articles for official mechanic and patch checks; TibiaData v4 only for the public data its current schema documents; and TibiaWiki-derived data only after verifying current terms, per-page license, attribution, and import behavior.
4. Start with user-entered or CSV prices. The Tibia Market community API may be added as an optional, clearly labelled source behind an adapter, never as the only source. Do not invent a market-price feed or treat asking prices as sale prices.
5. Keep Monk in the data model and item optimizer, but mark missing Monk hunting recommendations as unknown. Do not substitute recommendations from another vocation.
6. Implement a transparent estimate before claiming a precise hunt simulator. Only apply mechanics with a cited/validated rule; label user inputs and uncertain assumptions.
7. Save builds in browser storage with export/import initially; add accounts and cross-device sync only if approved later.
8. Do not bulk-copy Tibia sprites or use a client-memory/packet-capture source in the initial design.
9. Key items by client item ID, and model an equipped slot as base item + forge tier + imbuements (+ Weapon Proficiency perks for weapons). Tier, imbuements, and proficiency progress are per-character user inputs.

## Consequences

This design is feasible with an honest set of limitations, but item data, Monk hunt guidance, and market prices require validation or user input. A full-fidelity combat simulator cannot be promised from the sources reviewed. Attribution, share-alike handling, and CipSoft IP need to be addressed before a public data import or use of game art. External sources must be insulated behind adapters because endpoints, cache behavior, and upstream data can change.

The stack proposal is not installed or initialized. No app code, sample data, hosting configuration, or tests were added in Phase 00.

## Approval gate

Approval is required before Phase 01 implementation. If approved, Phase 01 should establish only the app foundation and data contracts; it should not silently begin Phase 02 imports or later product features.
