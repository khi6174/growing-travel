# Actual travel engine evidence

## Follow-up: isolated tamper assertions

Updated tests only. The `snapshot validator rejects tampered sums, order, references, URLs and coordinates` scenario now synchronizes tampered displaySnapshot with journey.placeSnapshots and the item's evidence copy. It also recomputes map URLs/link kinds from the altered coordinates, including search fallback for invalid coordinates. Therefore snapshot equality, evidence equality, and derived route equality cannot mask missing place URL/coordinate guards. Existing sum/order/reference/override mutations remain covered.

Invocation: `node --test tests/real-travel.test.mjs`. Binary observable: 10 PASS, 0 fail/skip. Artifact: `mirrored-tamper-tests.txt`. `node --check tests/real-travel.test.mjs` also exited 0. No production file changed in this follow-up. Root's preceding 95-test full run predates this tests-only delta.

## Follow-up: optional coordinate provenance

Added `geoSource` validation for saved departure, region and place snapshots. When supplied, URL must be HTTPS without embedded credentials, label must be nonempty text, and checkedAt must be a valid ISO calendar date. Omitted fields remain compatible; no legacy validator or catalog changes were made.

Invocation: `node --test tests/real-travel.test.mjs tests/journey-storage.test.mjs tests/storage.test.mjs`. Observable: 25 tests PASS, 0 fail/skip. Artifact: `geo-source-tests.txt`. Exact new scenario: `optional geoSource validates safe links, labels and calendar dates on all saved point types`; checks accepted omission and safe source plus rejected javascript URLs, null source, blank label, impossible and malformed dates at all three snapshot types. Place copies are mutated together so rejection proves source validation rather than snapshot mismatch.

Invocation: `node --check dist/travel-domain.mjs` and `node --check tests/real-travel.test.mjs`; both exit 0. Artifact: `geo-source-syntax.txt`, including updated pure line counts below 250. This follow-up uses the existing validation boundary and a shared source predicate; no new dependencies or logging. The earlier 94-test full run below predates this follow-up; final integrated full-suite execution remains with root.

Date: 2026-10-27. Scope: dist/travel-domain.mjs, travel-journey.mjs, travel-links.mjs, storage.mjs import dispatch, tests/real-travel.test.mjs. Workspace has no .git directory. No legacy domain/journey/data or fixture changes.

Invocation: `node --test tests/*.test.mjs`. Final binary observable: 94 tests, 94 pass, 0 fail, 0 skip. Captured artifact: `.omo/evidence/real-travel-engine/all-tests.txt`. The first sandbox run encountered loopback EACCES in the existing server test; the final run used approved elevated execution and passed that test too.

| Success criterion / exact scenario | Binary observable | Artifact |
| --- | --- | --- |
| Actual round-trip places, unknown travel/fare/total preserved | `real null aggregates never become zero and selected places form round trip` PASS | all-tests.txt |
| Directed leg IDs and user time overrides survive only matching segments after reorder | `user times apply only to matching directed legs; reorder discards obsolete overrides` PASS | all-tests.txt |
| Verified weekly closure excludes recommendation; null stairs excluded when avoidance requested | `regular closure is excluded; unknown stairs do not become accessible` PASS | all-tests.txt |
| Official Kakao route structure encodes names; missing coordinates produces explicit search kind | `map links encode names and use explicit search fallback when coordinates unknown` PASS | all-tests.txt |
| Stored sums/order/references/source links/coordinates reject corruption | `snapshot validator rejects tampered sums, order, references, URLs and coordinates` PASS | all-tests.txt |
| Saved official description remains historical, not rebuilt from live catalog | `historical official description is validated from saved snapshot without catalog rebuild` PASS | all-tests.txt |
| Invalid input/date/duplicates/overrides/evidence fail | `input bounds, dates, duplicate selections and references fail before saving` PASS | all-tests.txt |
| Actual and example courses coexist and repeat requests return their original version | `mixed real and legacy store preserves old request history and idempotence` PASS | all-tests.txt |
| Pre-student fixture and historic request remain intact alongside real course | `pre-student historical request bytes coexist unchanged with new real course` PASS | all-tests.txt |
| Existing behavior | All 85 existing tests PASS in same 94-test invocation | all-tests.txt |
| Changed JS parses; module size stays below 250 pure lines | `node --check` on each owned changed file, exit 0 | syntax-size.txt |

Earlier focused invocation: `node --test tests/real-travel.test.mjs`, 9/9 pass in focused-tests.txt. Final full suite additionally includes later optional source URL validation assertions.

Architectural review: each new module owns one boundary (course contracts, journey plans, outbound map links); legacy outputs are delegated unchanged. Runtime inputs are validated before snapshots or persistence. This existing plain ESM project retains Node tests and manual validation rather than adding frameworks. No logging, unchecked type escapes, new dependencies, external API fetching, or automatic persistence were introduced. Numeric durations are user planning values, not verified transit schedules. Transit time inputs cannot establish walking totals, which remain null. Source data research and browser checks belong to root/UI work and are not claimed here.
