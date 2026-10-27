# Growing Travel MVP visual and design-system review

Date: 2026-10-27. Review round: 2. Verdict: PASS. Recommendation: APPROVE. Final review of the stable 20:40:38 CSS and fresh 20:41 captures.

Scope: approved traveler wireframe applied to the existing MVP, not a pixel-identical clone. Read-only implementation review; only this report is written. No browser interaction, production API verification, storage test, or new test execution is claimed by this reviewer.

## Findings by severity

- CRITICAL: None open.
- HIGH: None open.
- MEDIUM: None established in the assigned visual/design-system scope.
- LOW: No additional cosmetic changes requested.

## Closed findings and independent verification

1. **HIGH, resolved: light benefits summary foregrounds.** The first review found white/light gray values from the old dark summary palette winning the cascade over the new light surface (`styles.css:554`–`:564`). Current `traveler.css:157`–`:168` supplies matching-specificity semantic foregrounds for the root, heading, values, labels, self-report, status/error messages and save action. Directly opened the new `benefits-top-390-viewport.png`, `benefits-status-390-viewport.png`, and `benefits-status-1440-viewport.png`: all three summary columns, the self-report label, expanded unsaved-status text and save action are now readable. The refreshed nine-screen matrix contains the same correction.

2. **HIGH, resolved: new layer bypassing reusable tokens.** Shared spacing, typography, radii, touch targets and repeated selection colors now use existing `--refine-*` / `--radius-*` tokens and a small `--travel-*` extension (`traveler.css:2` onward). Inspected the worker's token evidence and independently resolved every non-custom declaration against current `styles.css`. With the separately intentional fixed white navigation underlay removed from the comparison and its desktop navigation-space alias normalized, all 775 ordered declarations retain exactly the original values: 0 differences. This closes the systemic token regression; isolated component-specific image geometry is not a substitute for shared primitives and is not treated as a blocker.

The current `.app-frame::after` is an empty CSS backing surface beneath the bottom navigation, not a screenshot or simulated content. It has `pointer-events:none`, and current home/course/benefit viewport captures show legible navigation over the scrolling body.
## What is verified and should be preserved

- Live DOM: `dist/app.mjs` creates region cards (`renderRegions`, line 138), benefit tickets (`renderBenefitsContent`, line 206), experience cards (`renderResults`, line 358), and timeline rows (`courseExperienceRow`, line 428; `renderCourseTimeline`, line 471). Shared element/button/reason helpers and reusable classes render content and controls. The home, forms, navigation and dialogs are real HTML in `dist/index.html`.
- The station/garden/bookstore bitmap assets are illustrations of explicitly fictional places, not replacements for text, inputs, route controls or navigation. Experience card SVG art is likewise decorative within live cards.
- Reference structure is recognizable across all nine contexts: home, preferences, trip conditions, region comparison, experience selection, course, benefits, saved courses and settings. The desktop captures preserve the intentionally centered mobile shell.
- The course prioritizes station → connection → experience → return. The visible edit controls are in normal flow in `traveler.css:138`, and the course screenshot shows a readable first row with separate controls. Numeric units and stored calculation values are intentional retained MVP behavior.
- Coupon notches appear on official benefit tickets and the course's distinct benefit invitation. Region, experience and saved-course containers are ordinary cards. The course route itself is not represented as a coupon.
- The four bottom destinations are present consistently and the active destination follows the current context. Main actions are visually prominent above the navigation, with secondary profile save differentiated.
- The earlier save-error viewport shows the acknowledgement and corrective message above the fixed action. The condition-error viewport shows the invalid age, adjacent explanation, focus outline, and enabled submit/apply actions. This is screenshot evidence, not an independent interaction test.
- Dark mode is explicitly outside this implementation. No dark-mode or real-device pass is claimed. Full-page captures include fixed-position layers inside long content; that artifact alone is not evidence of inaccessible content or permanent overlap.

## Evidence inspected

Reference and contract:
- `wireframes/traveler-service/DESIGN.md`
- `wireframes/traveler-service/evidence/board-desktop.png`
- `dist/DESIGN.md`
- `plans/12_WIREFRAME_TO_MVP.md`

Code:
- `dist/index.html`, `dist/app.mjs`, `dist/traveler.css`, relevant inherited rules and token layer in `dist/styles.css`
- `.omo/evidence/mvp-flow-implementation/changes.diff.txt`, `changed-source.json`, `report.md`; these are historical evidence, not assumed current hashes. Current source was read directly, including follow-up region order changes absent from the older diff.

Every supplied after screen was opened directly, in both nominal width sets, under `plans/design-2026-10-27/mvp-application/`:
- `home-{390,1440}-after.png`
- `profile-{390,1440}-after.png`
- `trip-{390,1440}-after.png`
- `regions-{390,1440}-after.png`
- `experiences-{390,1440}-after.png`
- `course-{390,1440}-after.png`
- `benefits-{390,1440}-after.png`
- `saved-{390,1440}-after.png`
- `settings-{390,1440}-after.png`
- `course-390-viewport.png`, `benefit-coupon-390-viewport.png`, `save-error-390.png`, `condition-error-390.png`

Freshness: independently checked raw capture timestamps rather than PNG conversion times. All 18 final nominal 390/1440 after-screen raw files are dated 20:41:09–20:41:59, after stable traveler.css at 20:40:38. Reopened every one of the 18 final images directly. The focused home/course viewports, benefits top, expanded-status viewports at both widths, and coupon viewport were also reopened. `capture-metadata.json` records original JPEG byte format and actual output dimensions; PNGs are conversions without retouching, not pixel-diff or real-device evidence. Nominal viewport filenames must not be taken as exact bitmap dimensions: many full-page images exclude the desktop scrollbar gutter (375px / 1424px raster width). The old save-error/condition-error captures are retained only as evidence of their specific earlier interaction state, not as final-build pixel proof. No new error-state execution or complete accessibility conformance is claimed by this reviewer.

Additional evidence inspected:
- `plans/design-2026-10-27/mvp-application/capture-metadata.json`
- `plans/design-2026-10-27/mvp-application/benefits-top-390-viewport.png`
- `plans/design-2026-10-27/mvp-application/benefits-status-390-viewport.png`
- `plans/design-2026-10-27/mvp-application/benefits-status-1440-viewport.png`
- `plans/design-2026-10-27/mvp-application/home-390-viewport.png`
- `.omo/evidence/mvp-flow-implementation/traveler-token-before.css.txt`
- `.omo/evidence/mvp-flow-implementation/traveler-token-value-preservation.json`
Source hashes at review readback:
- index.html: 46BD5E1A17DCDA1DC937E0AC6D0778CA9586DA1A1DD42A301FDD4FED072B784B
- app.mjs: 7332EE098092D30528802F4B25EA7E9D1C8566575EBFA1CB37E098791FCD41D8
- traveler.css: 0989EDA48F59DFFF6A008676806FC03A5A607682FAEFF10401F1C0891BAD7FC4
- styles.css: 6CB12D28DF7F1BCB1A8000D4695C6F10FBCFC55772EC25E5CEE29E3D71479719

## Blockers

None in the assigned visual and design-system scope. Both initial high findings are resolved with inspected source and fresh rendered evidence.

The final implementation uses real reusable DOM components and shared tokens, preserves the approved consumer travel hierarchy and benefits-only coupon language, and shows consistent readable screens at the supplied phone/desktop widths. This approval covers the wireframe application, not pixel identity, real-device testing, production integrations, official-benefit currency, or the parent's separate functional QA.
