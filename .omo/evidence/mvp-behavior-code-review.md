# D23 MVP behavior code review

Date: 2026-10-27. Reviewer scope: read-only source/diff review; no browser, Git, toolkit, or production edits. Parent owns visual QA at `plans/design-2026-10-27/mvp-application/`.

## Result

- codeQualityStatus: CLEAR
- recommendation: APPROVE
- blockers: none in reviewed behavior changes

## Findings by severity

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None introduced in the reviewed change.

### LOW
None remaining. Resolved on re-review: `dist/screen-navigation.mjs:44` now chooses course wording only when `state.lastTravelScreen === 'course'`, matching the resume destination at `dist/app.mjs:642`. Input-stage resume uses the input-stage wording even when a course exists. Inspected the current source and the worker's `resume-label-syntax.txt` (exit 0) and `resume-label-navigation-tests.txt` (8 passed, 0 failed) under `.omo/evidence/mvp-flow-implementation/`. No broader behavior change was required.

## Review evidence

Inspected current `dist/index.html`, `dist/app.mjs`, `dist/navigation.mjs`, `dist/screen-navigation.mjs`, relevant sticky/action/form rules in `dist/traveler.css`, and `tests/navigation.test.mjs`; compared the implementation worker's `changes.diff.txt` under `.omo/evidence/mvp-flow-implementation/`. That diff predates the subsequent copy-only HTML follow-up; current HTML and the follow-up description were also inspected. There is no Git baseline here. The worker's evidence report supplies before snapshots and changed-source metadata; no unavailable full-repository diff is claimed.

Independently ran `node --test tests/navigation.test.mjs`: exit 0, 8 tests passed, 0 failed, 0 skipped. Inspected the full-suite artifact `.omo/evidence/mvp-flow-implementation/all-tests.txt`: it reports 85 passed, 0 failed, 0 skipped. The full suite was not independently rerun by this reviewer. The report and artifact references are concrete; no unsupported successful browser verification is asserted.

Checked behavior boundaries:

- `app.mjs:30` restores current personal values/preferences into the shared form; `app.mjs:55` invokes it for either profile or settings. Historical course loading at `app.mjs:559` continues to keep `personalBenefitInput` separate from snapshot fields. Navigation does not write either store.
- Profile writes remain explicit in submit (`app.mjs:610`), benefit settings save (`app.mjs:645`) and existing sheet actions. Course saving still requires acknowledgment and read-back verification (`app.mjs:575`). Navigation extraction introduces no new persistence operation.
- `screen-navigation.mjs:68` deduplicates shared panel IDs, so the profile/settings alias does not immediately re-hide the shared panel. Each destination panel has its required heading.
- `navigation.mjs` preserves draft readability with invalid new inputs and guards unavailable comparisons/recommendations. New home/settings routes remain independent of trip readiness. Tests assert these observable route contracts.
- Last-item removal focuses the recovery control (`app.mjs:447`), now outside the hidden editor (`index.html:87`). The details-to-div edit preserves action buttons, busy guards, ordering and evidence behavior. Invalid title opens its details control before focus (`app.mjs:579`).
- Sticky primary actions remain in their forms/panels; their CSS does not change submit semantics. Actual overlapping, scrolling, virtual keyboard, safe-area and focus visibility remain browser QA responsibilities, not conclusions of this static review.

## Skill perspective check

Ran the `remove-ai-slops` and `programming` perspective checks after reading both SKILL.md files and the programming TypeScript/JavaScript reference README from the installed OmO skill package. Inspected tests and production changes for deletion-only assertions, prose pins, tautological assertions, implementation constant mirroring, unnecessary parsing/normalization, untyped escape hatches and speculative abstractions.

No such new violation was found. The navigation tests exercise the public resolver/tab behavior under meaningful readiness states, rather than checking source spelling or a requested removal. The navigation factory extracts one coherent DOM responsibility and keeps existing storage/domain ownership; it is not a speculative adapter layer. No new framework, validator or data extraction machinery was introduced.

The legacy app remains oversized and native JavaScript lacks the stricter TypeScript contracts described by the skill; this is inherited architectural debt, not evidence that this scoped UI change newly violates the skill perspective. The extraction reduces app responsibility. A whole-toolchain migration or broad app refactor is outside this review's authorized scope. Existing broad catches/legacy normalization were not rewritten by this change.

## Remaining verification

Parent must finish browser QA of composed CSS, keyboard focus, save/reopen/refresh and responsive layouts. This report approves the reviewed code behavior only and does not replace that evidence. The low-severity resume-copy finding is resolved without altering persistence.
