# Real travel documentation evidence

## Final coordinate/documentation delta

Only docs/13_REAL_TRAVEL_SOURCES.md and plans/13_REAL_TRAVEL.md changed in this follow-up. Seoul Station now records Wikidata Q20415 representative coordinates and separate KRIC address provenance; the government complex records the official ended-event page's address/representative map point, never current event hours/fees. All 14 catalog coordinate points are present. Missing-coordinate fallback remains for historical/future data. The final integration log is directly observed as 95 pass, 0 fail, 0 skip; browser documentation remains pending root's artifacts.

| Scenario | Invocation | Binary observable | Captured artifact |
| --- | --- | --- | --- |
| Updated local links, definitions and source preservation | `node scripts/check-docs.mjs` | exit 0, passed true, failures empty | [final-delta-doc-check.json](final-delta-doc-check.json) |
| All 14 catalog points finite; four new coordinate numbers in source doc; local government HTML has coordinates/address; Wikidata/end-event/fallback distinctions; final raw test counts and browser pending | PowerShell here-string using Node assert piped to `node --input-type=module`; imports real-catalog and reads docs13, plan13, government-source.html and automated-tests.txt | exit 0, passed true, 14 coordinate points; 95/0/0 raw log counts | [final-delta-check.json](final-delta-check.json) |

This delta does not claim an external source revalidation, test rerun or browser pass by the documentation worker. The following initial documentation evidence remains historical.

Date: 2026-10-27. Scope: README.md, AGENTS.md, docs/00_DECISIONS_AND_SOURCES.md, docs/08_LOCAL_DEMO_DECISIONS.md, docs/13_REAL_TRAVEL_SOURCES.md, plans/13_REAL_TRAVEL.md. No application/test code edited. Workspace .git is absent. Existing source snapshots and historical reports preserved.

| Success criterion / exact scenario | Invocation | Binary observable | Captured artifact |
| --- | --- | --- | --- |
| Documentation links, identifiers, required files, preserved source hashes | `node scripts/check-docs.mjs` | exit 0; `passed: true`; `failures: []`; both source hash matches true | [doc-check.json](doc-check.json) |
| Unique new decision/proposal/source IDs; 8 real place names documented; 3 regions and 3 departures; README/AGENTS/local-choice links and legacy label; browser pending; raw logs exist and have reported counts | PowerShell here-string below piped to `node --input-type=module` | exit 0; `passed: true`; 8/3/3 counts; browserStatus pending | [scope-check.json](scope-check.json) |

Scope assertion invocation used:

```powershell
@'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { REAL_PLACES, REAL_REGIONS, REAL_DEPARTURES } from './dist/real-catalog.mjs';
const read = (p) => fs.readFileSync(p, 'utf8');
const ledger = read('docs/00_DECISIONS_AND_SOURCES.md');
for (const id of ['D24','P28','S22','S23']) assert.equal((ledger.match(new RegExp('^\\| '+id+' \\|', 'gm')) ?? []).length, 1, id);
assert.equal(REAL_PLACES.length, 8); assert.equal(REAL_REGIONS.length, 3); assert.equal(REAL_DEPARTURES.length, 3);
const sources = read('docs/13_REAL_TRAVEL_SOURCES.md');
for (const place of REAL_PLACES) assert.ok(sources.includes(place.title), place.title);
assert.ok(sources.includes('OpenStreetMap')); assert.ok(sources.includes('관광안내소')); assert.ok(sources.includes('8월에 종료'));
const plan = read('plans/13_REAL_TRAVEL.md');
assert.ok(plan.includes('진행 중. 본 문서 작성 시점에 완료 주장 없음'));
for (const p of ['README.md','AGENTS.md','docs/08_LOCAL_DEMO_DECISIONS.md']) {
 const body = read(p); assert.ok(body.includes('13_REAL_TRAVEL')); assert.ok(body.includes('이전 예시 코스')); assert.ok(body.includes('D24'));
}
assert.ok(read('.omo/evidence/real-travel-engine/all-tests.txt').includes('pass 94'));
assert.ok(read('.omo/evidence/real-travel-ui/integration-tests.log').includes('pass 22'));
assert.equal(fs.existsSync('.git'), false);
console.log(JSON.stringify({passed:true, decisionIds:['D24','P28','S22','S23'],catalog:{places:REAL_PLACES.length,regions:REAL_REGIONS.length,departures:REAL_DEPARTURES.length},sourceRowsComplete:true,browserStatus:'pending',pastRawLogs:{engine:94,ui:22},gitDirectoryAbsent:true},null,2));
'@ | node --input-type=module
```

The engine/UI test counts are direct observations of existing raw logs, not test runs by this documentation worker. No browser, external source revalidation, transit timing, deployment or booking is claimed here. Source notes reconcile the supplied research with the current catalog and locally retained HTML. docs/11 and docs/12 were occupied, so docs/13_REAL_TRAVEL_SOURCES.md was chosen. Browser acceptance belongs to the integration owner and is explicitly pending in plans/13_REAL_TRAVEL.md until root adds final results.
