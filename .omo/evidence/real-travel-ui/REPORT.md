# Real travel UI integration evidence — 2026-10-27

Owned implementation: dist/app.mjs, dist/real-travel-view.mjs. screen-navigation.mjs read and left unchanged. No Git checkout present per workspace instructions; no git mutation performed. Parent owns browser and visual acceptance. The requested ulw-loop status invocation returned ULW_LOOP_SUBCOMMAND_UNKNOWN; evidence therefore uses .omo/evidence/.

| Scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| Controller parse | node --check dist/app.mjs | exit=0 | app-syntax.log |
| Real view helper parse | node --check dist/real-travel-view.mjs | exit=0 | view-syntax.log |
| Real/legacy contracts, time overrides, date closures, route links, mixed persistence; navigation and copy regressions | node --test tests/real-travel.test.mjs tests/navigation.test.mjs tests/ui-copy.test.mjs | 22 tests, 22 pass, 0 fail | integration-tests.log |

Implemented: adapter imports; actual region choices; actual place details with public sources; unillustrated actual cards; all outbound/local/return legs; route and walking links; optional stable-leg minutes with adjacent validation and focus restoration; explicit saving without legacy acknowledgment for actual journeys; saved snapshot rendering and restoration of overrides; legacy course label and acknowledgment retained. Personal benefit settings remain independent of reopened courses.

Read-only code review: existing controller preserves event/state boundaries. New helper owns real-travel view DOM rendering; inputs validate bounded integer minutes before handing values to the controller and domain normalization. Measured pure lines: helper 68; existing controller 712. No dependency or storage-key change. Existing large controller received local edits; broader refactoring remains outside the delegated assignment.

Browser behavior, screen appearance, focus behavior in a real browser, and full user flow are not claimed by these unit/syntax artifacts. Parent performs those acceptance scenarios after HTML/CSS integration. No live route timing, external booking, or deployment performed.


## Finishing pass
Changed only app.mjs and screen-navigation.mjs: showFieldErrors opens every ancestor details before focusing first invalid input; shortened profile/settings intro and saved-course confirmation. Existing legacy labels and verification limitations retained.
- node --check dist/app.mjs and dist/screen-navigation.mjs: both exit 0, finish-syntax.log.
- node --test tests/navigation.test.mjs tests/profile.test.mjs tests/ui-copy.test.mjs: 20 pass / 0 fail, finish-tests.log.
- node .omo/evidence/real-travel-ui/focus-check.mjs: PASS. Executes the actual extracted showFieldErrors with collapsed nested details and verifies both are open at focus time plus adjacent error retained; focus-check.log. This is a controlled function harness, not real browser evidence.

## Browser feedback polish
- Actual/default region comparison hides the sort-control and old official-benefits details; legacy comparison retains both.
- Actual region cards replace repeated place count with a short route-check note; no-match explanation remains.
- Walking links are limited to local legs by departure ID even if a historical intercity leg contains walkUrl.
- Journey summary adds collapsed 지도 위치 안내 when saved points contain geoSource, links each source and adds © OpenStreetMap contributors credit link for OSM data. Representative-point and entrance/boarding limitation retained.
- Removed redundant unsaved profile-entry message; explicit save/error feedback remains.
- Invocations: node --check dist/app.mjs and dist/real-travel-view.mjs, exit 0 in polish-syntax.log. node --test tests/real-travel.test.mjs tests/navigation.test.mjs tests/ui-copy.test.mjs, 22 pass / 0 fail in polish-tests.log.
- Real browser layout and link presence verification remains parent-owned; these artifacts establish syntax/regression only.

## Accessible consumer labels
Actual place detail aria-label now uses 장소 자세히; actual saved-course link uses 코스 다시 열기. Legacy aria labels unchanged. Reorder/remove focus restoration identifies detail controls by data-course-detail exact experience ID, independent of display label. Only app.mjs changed. node --check dist/app.mjs exit 0 (aria-syntax.log); node --test tests/navigation.test.mjs tests/ui-copy.test.mjs 13 pass / 0 fail (aria-tests.log). Browser focus verification remains parent-owned.
