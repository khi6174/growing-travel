# Real travel bounded code review

codeQualityStatus: WATCH
recommendation: APPROVE
blockers: []

## Scope and evidence

Reviewed current dist/travel-domain.mjs, travel-journey.mjs, travel-links.mjs, real-catalog.mjs, real-travel-view.mjs, storage.mjs and the app.mjs course/recommendation/save/reopen integration; tests/real-travel.test.mjs. Goal and contract: plans/real-travel-2026-10-27/IMPLEMENTATION.md plus supplied AGENTS.md. This is a bounded current-code review, not a full historical diff certification: no Git repository or full before/after diff was supplied. No separate notepad supplied.

Independently executed node --test tests/real-travel*.test.mjs: 10 passed, 0 failed. Inspected .omo/evidence/real-travel-engine/all-tests.txt (94 passed, predating geoSource follow-up), geo-source-tests.txt (25 passed), engine RESULT.md and UI REPORT.md. Those historical artifacts are not substituted for a fresh complete-suite run. Browser and source research remain parent-owned; no claim to have independently exercised the browser or reverified official tourism facts.

The requested omo-agent-toolkit ulw-loop status --json failed with ULW_LOOP_SUBCOMMAND_UNKNOWN; fallback status also unsupported. .omo contains evidence only, with no loop plan. Report uses the prescribed fallback path.

## Findings

### CRITICAL
None found.

### HIGH
None found. No production correctness, safe-link handling, or aggregate honesty blocker identified in this scope.

### MEDIUM
M1 — Security-validation cases have a second rejection cause and therefore provide weaker regression protection than claimed. tests/real-travel.test.mjs:70-73 mutates only orderedItems[0].displaySnapshot. dist/travel-domain.mjs:105 rejects its disagreement with journeySnapshot.placeSnapshots regardless of the URL/coordinate-specific guard. The evidence URL case additionally differs from item.evidence. These tests can remain green after the intended guard regresses. Mutate corresponding saved copies consistently (including evidence copies and derived route links as applicable) so each test isolates the rejected field. The newer geoSource test already uses the right paired-copy approach. Current production guards are present; this is nonblocking test-quality work, not an observed security exploit.

### LOW
None within the bounded actionable scope.

## Skill-perspective check

Ran the programming and remove-ai-slops perspectives after loading both SKILL.md files and programming/references/typescript/README.md. M1 is a false-confidence regression-test weakness under both perspectives. No deletion-only, removal-pinning, tautological, prompt-prose, or implementation-constant-only tests were found in the new real-travel test file. No new untyped TypeScript escape hatches or unnecessary extraction/parsing pipeline found. Persistence, user-input and URL validation are required trust boundaries. Legacy adapters serve the explicitly required compatibility goal. The pre-existing large app module was not treated as a new architectural blocker; the new rendering helper provides a bounded separation. No cleanup or implementation changes were performed.

## Limits and conclusion

Unknown fare, walking and incomplete journey totals remain null; user minutes use directed stable leg IDs; reordered obsolete legs are omitted from generated snapshots. New saved snapshots validate without rebuilding place descriptions from the current catalog, and the mixed-store tests exercise old request-history idempotence. Current real-place snapshot URLs are HTTPS-validated before rendering through DOM properties, with textContent used for labels.

Approval is for this bounded code audit. Final complete-suite, actual UI and external-source claims must use the parent's current artifacts. Lint/typecheck/security-scanner gates were not run in this bounded review; no checked-JS or configured scanner was supplied. No blockers requiring implementation changes were found.
