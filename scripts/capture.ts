import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  readManifest,
  writeManifest,
  mergeCaptures,
  VIEWPORTS,
  type UrlEntry,
  type CaptureResult,
  type Viewport,
} from './lib/manifest.ts';

const NAV_TIMEOUT_MS = 45_000;
const SETTLE_MS = 1_000;
const SCROLL_STEP_PX = 600;
const SCROLL_PAUSE_MS = 400;
const POST_SCROLL_SETTLE_MS = 1_500;
// JPEG quality. 75 is the practical floor for screenshot tracking — mild
// artifacts on text edges and gradients are visible if you go pixel-hunting,
// but visually they read the same as PNG/q85 at normal viewing scale.
// Diff still works because the bumped pixelmatch threshold (Compare.tsx:0.2)
// absorbs the extra compression noise.
const JPEG_QUALITY = 75;

// Per-viewport browser context settings.
// Mobile starts from the iPhone 13 preset (realistic UA, isMobile, hasTouch,
// 390x844 viewport) but overrides deviceScaleFactor from 3 → 2. Real iPhone
// renders at DPR=3, but storing 3x pixel images is wasteful for a tracking
// tool — DPR=2 still looks crisp, still triggers all responsive breakpoints,
// and the file is roughly half the size.
const VIEWPORT_PRESETS: Record<Viewport, Parameters<import('playwright').Browser['newContext']>[0]> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { ...devices['iPhone 13'], deviceScaleFactor: 2 },
};

function timestamp(): string {
  // ISO minute precision, ':' replaced for cross-platform filenames.
  return new Date().toISOString().slice(0, 16).replace(':', '-');
}

/**
 * Trigger lazy-loaded sections by scrolling top-to-bottom in increments.
 * See commit e38ab7c for rationale. Script is passed as a string to bypass
 * tsx/esbuild's `__name` helper injection.
 */
async function scrollFullPage(page: import('playwright').Page): Promise<void> {
  const script = `(async function(step, pause) {
    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
    var prevHeight = -1;
    var stableLoops = 0;
    var y = 0;
    while (stableLoops < 2) {
      var docHeight = document.documentElement.scrollHeight;
      if (y >= docHeight) {
        if (docHeight === prevHeight) { stableLoops += 1; } else { stableLoops = 0; }
        prevHeight = docHeight;
        if (stableLoops >= 2) break;
      }
      window.scrollTo(0, y);
      await sleep(pause);
      y += step;
      if (y > docHeight * 2) break;
    }
    window.scrollTo(0, 0);
  })(${SCROLL_STEP_PX}, ${SCROLL_PAUSE_MS})`;
  await page.evaluate(script);
}

async function captureAtViewport(
  browser: import('playwright').Browser,
  entry: UrlEntry,
  viewport: Viewport,
  ts: string,
  dryRun: boolean,
): Promise<CaptureResult> {
  const { slug, url, waitFor = 'networkidle' } = entry;
  // Per-URL viewport override is only meaningful for desktop; mobile uses the preset.
  const baseSettings = VIEWPORT_PRESETS[viewport];
  const settings =
    viewport === 'desktop' && entry.viewport
      ? { ...baseSettings, viewport: entry.viewport }
      : baseSettings;
  const ctx = await browser.newContext(settings);
  const page = await ctx.newPage();
  const start = Date.now();
  try {
    await page.goto(url, { waitUntil: waitFor, timeout: NAV_TIMEOUT_MS });
    try {
      await page.evaluate(() => (document as Document).fonts?.ready);
    } catch {
      // ignore — some pages have no fonts API
    }
    await page.waitForTimeout(SETTLE_MS);
    await scrollFullPage(page);
    await page.waitForTimeout(POST_SCROLL_SETTLE_MS);
    const path = `screenshots/${slug}/${viewport}/${ts}.jpg`;
    mkdirSync(dirname(path), { recursive: true });
    const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: JPEG_QUALITY });
    if (!dryRun) writeFileSync(path, buf);
    console.log(`  ok    ${slug}  ${viewport}  ${buf.length} bytes  ${Date.now() - start}ms`);
    return { slug, ts, viewport, ok: true, bytes: buf.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`  FAIL  ${slug}  ${viewport}  ${error}`);
    return { slug, ts, viewport, ok: false, error };
  } finally {
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry');
  const urls = JSON.parse(readFileSync('urls.json', 'utf-8')) as UrlEntry[];
  if (urls.length === 0) {
    console.error('urls.json is empty');
    process.exit(1);
  }

  const ts = timestamp();
  console.log(`capture run ts=${ts} urls=${urls.length}${dryRun ? ' (dry)' : ''}`);

  const browser = await chromium.launch();
  const results: CaptureResult[] = [];

  for (const entry of urls) {
    const viewports = entry.viewports ?? VIEWPORTS;
    for (const viewport of viewports) {
      results.push(await captureAtViewport(browser, entry, viewport, ts, dryRun));
    }
  }

  await browser.close();

  const manifest = readManifest();
  const next = mergeCaptures(manifest, urls, results);
  if (!dryRun) writeManifest(next);

  const okCount = results.filter((r) => r.ok).length;
  console.log(`done: ${okCount}/${results.length} ok`);
  if (okCount < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
