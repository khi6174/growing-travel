# MVP traveler flow implementation evidence

Date: 2026-10-27. Ownership: dist/index.html, dist/app.mjs, dist/navigation.mjs, new dist/screen-navigation.mjs, tests/navigation.test.mjs. Root owns CSS, design documentation, browser verification, and final integration. No Git operation, deployment, browser automation, or domain/storage change was performed by this worker.

## Changed behavior

The application defaults to home. Home starts the existing profile/trip flow, independently opens benefits, and resumes a previously entered travel stage without resetting it. The settings route reuses the original profile form with a settings-specific heading and explicit save action. The travel profile route retains its existing validation and next-step behavior. Navigation presentation was extracted from the legacy app into screen-navigation.mjs.

Main actions use primary-action-bar wrappers; root supplies their layout. Regional benefit detail is collapsed after the region choice. Existing course edit controls are directly visible. The experience recovery button remains outside the editor so removing every experience does not hide it. Reordering restores focus to the moved experience; removal moves focus to a surviving experience or the recovery button.

The original calculations, storage keys, profile normalization, snapshot loading, official benefit records and matching modules were not edited. These claims are source-scope observations; UI behavior is checked separately by the parent.

## Scenarios and captured evidence

| Criterion / scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| Home/settings accessible without valid travel inputs | node --test tests/navigation.test.mjs | Named home/settings case passed; missing/unknown routes resolve home | navigation-tests.txt |
| Legacy profile route and correct bottom-tab mapping | Same invocation | Named legacy profile case passed; profile remains travel, settings uses profile tab | navigation-tests.txt |
| Stale/invalid inputs cannot bypass guards; existing draft still readable | Same invocation | Existing guard cases passed with frozen readiness inputs | navigation-tests.txt |
| Existing domain, storage, benefit and server regressions | node --test tests/*.test.mjs | 85 tests, 85 pass, 0 fail, 0 skipped, process exit 0 | all-tests.txt |
| JS parses after navigation extraction | node --check dist/app.mjs; node --check dist/navigation.mjs; node --check dist/screen-navigation.mjs | All three process exit codes 0 | syntax.txt |
| Source responsibility and preservation review | Python pathlib/difflib/hashlib read of owned files vs captured pre-edit text | Diff and SHA-256 values captured for all five owned files | changes.diff.txt; changed-source.json |

The first full test run could not connect to its temporary loopback server under the sandbox (EACCES). The complete suite was rerun with the approved Node test escalation, yielding the recorded 85/85 result. No test was skipped to obtain that result.

## Review and limits

New navigation presentation module has 83 nonblank/noncomment lines. The legacy app decreased from 706 to 678 by extracting its coherent navigation unit; broader unrelated refactoring was intentionally outside the assignment. The existing project uses native .mjs and Node tests, so no TypeScript/package/toolchain migration was introduced. Navigation callbacks use the existing DOM/state contract and do not create a second profile store or memory-only replacement.

No browser, mobile layout, focus movement, persistence-after-refresh or visual fidelity pass is claimed here. Root must verify these on the actual composed HTML/runtime/CSS surface. Before-source snapshots have .txt suffixes so original relative links are not treated as live documentation in this evidence directory.

## Browser-driven copy follow-up

The parent reported that the region choice was pushed down by repeated introductory text. On that concrete finding, index.html changed demo-note into a collapsed details/summary while retaining its complete original explanation, shortened the region introduction, and changed trip/region/experience stage labels to Korean. No runtime, domain or storage code changed in this follow-up. The three JS modules still pass node --check (copy-followup-syntax.txt); the new HTML hash is in copy-followup-index-sha256.txt. The full suite was not repeated for this copy/markup-only change. Parent owns the fresh rendered confirmation.

The home resume label now follows its actual lastTravelScreen target: course gets the course-resume label; other travel stages get the input-resume label. A retained course no longer makes a trip-target button claim it opens the course. Syntax passed (resume-label-syntax.txt) and the eight navigation tests passed (resume-label-navigation-tests.txt). No full-suite repeat for this display condition adjustment.
