// Headless smoke test for the viewer.
//
// Usage: node scripts/smoke-viewer.mjs http://localhost:5175
//
// Assumes a viewer preview server is already running at the given URL with
// manifest.json + screenshots/ staged into viewer/dist/.
//
// Exercises the routes that have broken in the past:
//   - List renders (had hooks-violation blank-screen bug)
//   - Detail renders (same)
//   - Pill click state machine (most recent bug: 3rd-click double-setParams)

import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://localhost:5175';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

function fail(msg) {
  console.log(`  FAIL: ${msg}`);
  process.exitCode = 3;
}

// Helper to read a/b from URL
const slots = () => {
  const u = new URL(page.url());
  return { a: u.searchParams.get('a'), b: u.searchParams.get('b') };
};

// --- list page renders ---
await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
const listH1 = await page.locator('h1').first().textContent({ timeout: 5000 });
console.log(`list h1="${listH1}"`);

// --- detail page renders ---
await page.goto(`${baseUrl}/u/kapiva-home`, { waitUntil: 'networkidle' });
const detailH1 = await page.locator('h1').first().textContent({ timeout: 5000 });
console.log(`detail h1="${detailH1}"`);

// --- pill click state machine ---
// Pick the first three ENABLED pills for the test (data availability varies
// by what the cron has produced recently).
const allPillLabels = ['Today', 'Yesterday', 'Day before', '7 days ago', '1 month ago', '6 months ago'];
const enabled = [];
for (const label of allPillLabels) {
  const loc = page.locator('button.pill', { hasText: label });
  if (await loc.count() > 0 && await loc.isEnabled()) enabled.push({ label, loc });
}
console.log(`enabled pills: ${enabled.map((e) => e.label).join(', ')}`);

if (enabled.length >= 3) {
  const [p1, p2, p3] = enabled;

  await p1.loc.click(); await page.waitForTimeout(150);
  let s = slots();
  console.log(`click 1 (${p1.label}):     a=${s.a}  b=${s.b}`);
  if (!s.a) fail('1st click should set a');
  if (s.b) fail('1st click should leave b clear');
  const a1 = s.a;

  await p2.loc.click(); await page.waitForTimeout(150);
  s = slots();
  console.log(`click 2 (${p2.label}): a=${s.a}  b=${s.b}`);
  if (s.a !== a1) fail('2nd click should NOT change a');
  if (!s.b) fail('2nd click should set b');

  await p3.loc.click(); await page.waitForTimeout(150);
  s = slots();
  console.log(`click 3 (${p3.label}, restart): a=${s.a}  b=${s.b}`);
  if (!s.a) fail('3rd click should set a to new value');
  if (s.a === a1) fail('3rd click should have CHANGED a (this was the stale-params bug)');
  if (s.b) fail('3rd click should clear b');
} else {
  console.log(`(skip pill tests: need 3 enabled pills, only ${enabled.length})`);
}

await browser.close();

console.log(`\nerrors captured: ${errors.length}`);
for (const e of errors) console.log('  ' + e);
if (errors.length) process.exitCode = 1;
