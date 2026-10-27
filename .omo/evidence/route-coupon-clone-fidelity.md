# Route and coupon final fidelity review

Recommendation: APPROVE (final re-review; initial findings below are resolved)

Scope: final HTML/CSS and specified render functions, compared with the supplied design and capture artifacts. No application code changed. No browser interaction or new runtime tests performed. This is an artifact/code review, not independent confirmation of successful browser interaction. No full before/after diff or notepad was supplied; workspace instructions identify this as a non-Git folder.

## CRITICAL

None found. The UI is not a pasted screenshot: headings, summary values, route nodes, editing controls and benefit sections are live DOM. Raster assets are restricted to station/garden/bookstore illustrations.

## HIGH

### H1 — The new refinement is not driven by reusable design tokens

`dist/styles.css:661`, `:663`, `:666`, `:671`, `:675`, `:679`, `:700`, `:703`, `:705`, `:708`, `:734`, `:741`, `:743` hardcode repeated colors, typography, spacing and radii. For example the same secondary text color `#62656d` is repeated through the course block, while 12/13px typography and 20px/12px radii bypass a shared scale and the existing `--radius-card` / `--radius-box` variables at lines 471–473. Only some colors use the existing tokens. Thus visual alignment is present, but the mandatory rigorous design-system gate is not satisfied.

Fix: extract shared semantic course/benefit text, surface, border, spacing and typography tokens; consume existing radius tokens where values agree; replace the repeated literals in the refinement block without changing the intended rendered appearance. This is a design-system compliance blocker, not a claim that the displayed palette is visually wrong.

## MEDIUM

### M1 / P2 — Collapsed editing entry is narrower than the requested 44px target

`dist/styles.css:691–692` gives the summary a 44px minimum height but no minimum width and zero horizontal padding. Its closed parent is absolutely positioned with automatic width, so the short 12px “편집” text plus marker determines a narrow hit area. This narrow entry is visible in `course-top-final.png`. The four buttons after expansion do correctly use minimum 44×44px at line 700, but users must first operate this smaller entry (`dist/app.mjs:492`).

Fix: give `.course-edit-actions > summary` a minimum inline size of 44px, preserving the 44px minimum height and current placement. Validate the actual collapsed hit box at the final mobile width; this review does not invent a browser-measured numeric width.

## LOW / accepted differences and limitations

- Natural scrolling, the existing back button, separate actual transport legs, title editing, explicit acknowledgement and storage cautions are deliberate product requirements. Their presence is not a fidelity defect.
- The capture differs from the reference in actual metrics and selected experience order. That is correct: `renderCourseOverview` at `dist/app.mjs:454–462` consumes snapshot estimates; formatters at lines 151–152 preserve nonfinite/null values as 미확인. The mock 155분 / 30분 / 24,000원 and absolute clock times were not copied into these renderers.
- `renderCourseTimeline` at lines 499–520 uses snapshot leg endpoints/modes and live `courseExperienceRow` controls. `renderJourney` at lines 358–375 retains unknown/limit cautions and keeps stored virtual benefit conditions distinct.
- `dist/index.html:83` explicitly directs users to the separate benefits tab and says no deduction from virtual course cost. Perforation/notch rules are scoped to benefit ticket sections (`dist/styles.css:588–591`, `:708–711`), not the course panel or timeline.
- Benefit candidates remain actual reusable ticket cards with an expandable button, separate public-status section and detail region (`dist/app.mjs:284–307`). White/cobalt course hierarchy, summary triplet, vertical route line, illustrated experience rows and separate coupon appear in the supplied captures.
- `plans/11_ROUTE_COUPON_REFINEMENT.md` was linked from README/AGENTS but absent at inspection time. Treat final documentation completion as pending; no claim of misleading completion was supplied to this reviewer.

## Inspected evidence

- `plans/design-2026-10-27/source-combined.png` — reference
- `plans/design-2026-10-27/course-top-final.png` — rendered route/header
- `plans/design-2026-10-27/course-coupon.png` — rendered separate notice
- `plans/design-2026-10-27/benefit-ticket.png` — rendered personal/public ticket split
- `plans/design-2026-10-27/capture-metadata.json` — recorded capture dimensions; not treated as runtime verification
- `dist/index.html` course and benefits sections
- `dist/app.mjs` requested renderers, benefit DOM creation, null formatters and navigation/save bindings
- `dist/styles.css` final refinement and relevant earlier token/notch/control rules
- `README.md`, supplied AGENTS.md context, docs decision and local-demo scope records

## Initial approval blockers — resolved in final re-review

1. Replace repeated refinement styling literals with a reusable token layer (H1).
2. Ensure the collapsed editing entry meets the requested 44×44px target (M1/P2).

## Final re-review — 2026-10-27

Recommendation: APPROVE for the scoped route-first / separate benefit coupon adaptation. Blockers: none. This does not approve every legacy stylesheet rule or claim a complete brand-system rewrite or pixel-exact clone.

- CRITICAL: none.
- HIGH: none remaining. H1 resolved: `dist/styles.css:643–736` defines the scoped reusable semantic palette/type/leading/spacing/route tokens. The appended rules consume these tokens and reuse existing `--radius-box`, `--radius-card`, `--green` and `--ink`. The targeted correction leaves earlier legacy styling outside this scope.
- MEDIUM: none remaining. M1 resolved: `dist/styles.css:784` gives the collapsed editing summary both minimum width and height from `--refine-target-min` (44px at line 690). Inspected `plans/design-2026-10-27/runtime-checks.json` records both summaries at 44×44px at 390×844. This is executor measurement evidence, not a browser measurement independently rerun by this reviewer.
- LOW: no new actionable issue found. Natural scrolling, actual route metrics, retained controls and cautions remain intentional product constraints.

Freshly inspected final `course-top-final.png`, `course-coupon.png`, `course-320.png` and `course-1440.png`: the prior white/cobalt hierarchy, real route labels, experience imagery and separately notched notice remain visually intact; the narrow-screen capture keeps summary values and editing entries visible. No screenshot substitutes for the DOM are introduced by the CSS revision.

Additional evidence inspected: updated appended CSS, `runtime-checks.json`; existence of `plans/11_ROUTE_COUPON_REFINEMENT.md` confirmed (the earlier missing-file observation is resolved). Earlier reference/code/benefit-ticket inspection remains applicable to unchanged renderers and structure. No new browser operations, application edits or runtime tests performed by this reviewer.
