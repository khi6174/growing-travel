// Documentation checks only; no application tests, network access, or dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const failures = [];
const required = [
  'AGENTS.md', 'README.md', 'handoff/growing-travel/CODEX_START.md',
  'handoff/growing-travel/growing-travel-service-guide-ko.pdf',
  'docs/00_DECISIONS_AND_SOURCES.md', 'docs/01_PRODUCT_SPEC.md',
  'docs/02_UX_FLOWS.md', 'docs/03_DATA_AND_AI_CONTRACT.md',
  'docs/04_DEVELOPMENT_PLAN.md', 'docs/05_ACCEPTANCE_TESTS.md',
  'docs/06_TEAM_AND_VALIDATION.md', 'docs/07_SOURCE_REVIEW.md', 'docs/08_LOCAL_DEMO_DECISIONS.md', 'plans/01_FILE_SETUP.md',
  'plans/02_FIRST_VERTICAL_SLICE.md', 'plans/03_LOCAL_DEMO_IMPLEMENTATION.md',
];
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'node_modules', '.codex', '.agents', '.claude'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
  });
}
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
}
const allFiles = walk(root);
const markdown = allFiles.filter((file) => file.endsWith('.md'));
const bodies = new Map(markdown.map((file) => [relative(file), fs.readFileSync(file, 'utf8')]));
const stripFences = (body) => body.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
const definitions = new Set();
const definitionFiles = [
  'docs/00_DECISIONS_AND_SOURCES.md', 'docs/01_PRODUCT_SPEC.md',
  'docs/02_UX_FLOWS.md', 'docs/05_ACCEPTANCE_TESTS.md',
  'plans/02_FIRST_VERTICAL_SLICE.md',
];
for (const file of definitionFiles) {
  for (const match of (bodies.get(file) ?? '').matchAll(/^\| ((?:D|P|Q|F|UX|AC|DEV)\d{2}) \|/gm)) {
    if (definitions.has(match[1])) failures.push(`Duplicate definition: ${match[1]}`);
    definitions.add(match[1]);
  }
}
let localLinkCount = 0;
let identifierReferenceCount = 0;
for (const [file, body] of bodies) {
  const text = stripFences(body);
  // Supports this repository's inline Markdown file links, optional heading fragments.
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    let href = match[1].trim();
    if (/^(?:https?:|mailto:)/i.test(href)) continue;
    href = href.replace(/^<|>$/g, '');
    const [pathname, fragment] = href.split('#');
    const target = path.resolve(root, path.dirname(file), decodeURIComponent(pathname || path.basename(file)));
    const targetRelative = path.relative(root, target);
    localLinkCount += 1;
    if (targetRelative.startsWith('..') || path.isAbsolute(targetRelative)) {
      failures.push(`Link outside workspace: ${file} -> ${href}`);
      continue;
    }
    if (!fs.existsSync(target)) {
      failures.push(`Broken local link: ${file} -> ${href}`);
      continue;
    }
    if (fragment) {
      const headings = [...fs.readFileSync(target, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)]
        .map((heading) => heading[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-'));
      if (!headings.includes(decodeURIComponent(fragment))) failures.push(`Missing heading: ${file} -> ${href}`);
    }
  }
  if (file.startsWith('handoff/')) continue; // Preserve the supplied source verbatim.
  for (const match of text.matchAll(/\b(?:D|P|Q|F|UX|AC|DEV)\d{2}\b/g)) {
    identifierReferenceCount += 1;
    if (!definitions.has(match[0])) failures.push(`Undefined identifier: ${file} -> ${match[0]}`);
  }
  if (file.startsWith('docs/') && !body.includes('전달 패키지 docs 원문 미확보')) {
    failures.push(`Missing source-gap notice: ${file}`);
  }
}
const sourcePath = path.join(root, 'handoff/growing-travel/CODEX_START.md');
const expectedHash = '36bd1f6844233e3519b9f0ea00814630685ff7bcd04b77180a6e227325f2d9ea';
const actualHash = fs.existsSync(sourcePath)
  ? crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex') : null;
if (actualHash !== expectedHash) failures.push('Supplied CODEX_START snapshot differs from captured SHA-256.');
const pdfPath = path.join(root, 'handoff/growing-travel/growing-travel-service-guide-ko.pdf');
const expectedPdfHash = '7215d95321d48559e7a148e682deb9ee4c8f166cb86d02bc5ea964db240a2af5';
const actualPdfHash = fs.existsSync(pdfPath)
  ? crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex') : null;
if (actualPdfHash !== expectedPdfHash) failures.push('Supplied PDF snapshot differs from captured SHA-256.');
const acceptanceBody = bodies.get('docs/05_ACCEPTANCE_TESTS.md') ?? '';
const acceptanceRows = [...acceptanceBody.matchAll(/^\| AC\d{2} \|.+$/gm)];
if (acceptanceRows.length !== 13 || acceptanceRows.some(([row]) => !/\| (?:미실행|부분 검증|통과|해당 없음)[^|]* \|$/.test(row))) {
  failures.push('Expected 13 acceptance scenarios with explicit, scoped execution status.');
}
const dataFiles = allFiles.map(relative).filter((file) =>
  /(^|\/)(fixtures?|samples?|demo|seed|data)(\/|\.)/i.test(file)
  || /\.(csv|tsv|jsonl|sqlite|db|xlsx)$/i.test(file)
  || (/\.json$/i.test(file) && !file.startsWith('plans/')));
const report = {
  checkedAt: new Date().toISOString(),
  scope: 'Local documentation structure only; not product tests or real-world verification.',
  requiredFileCount: required.length,
  markdownFileCount: markdown.length,
  localLinkCount,
  identifierDefinitionCount: definitions.size,
  identifierReferenceCount,
  sourceSnapshotSha256: actualHash,
  sourceSnapshotMatches: actualHash === expectedHash,
  pdfSnapshotSha256: actualPdfHash,
  pdfSnapshotMatches: actualPdfHash === expectedPdfHash,
  plannedAcceptanceCount: acceptanceRows.length,
  acceptanceStatuses: acceptanceRows.map(([row]) => ({ id: row.split('|')[1].trim(), status: row.split('|').at(-2).trim() })),
  detectedDataFiles: dataFiles,
  dataScanLimit: 'Filename inventory only; prose and synthetic/real-world claims require manual review.',
  failures,
  passed: failures.length === 0,
};
if (process.argv.includes('--report')) {
  // Keep the original file-setup report as historical evidence.
  fs.writeFileSync(path.join(root, 'plans/03_DOC_CHECK_RESULTS.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = failures.length ? 1 : 0;
