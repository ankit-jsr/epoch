import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  readManifest,
  writeManifest,
  mergeCaptures,
  type UrlEntry,
  type CaptureResult,
} from './lib/manifest.ts';

const NAV_TIMEOUT_MS = 45_000;
const SETTLE_MS = 1_000;

function timestamp(): string {
  // ISO minute precision, ':' replaced for cross-platform filenames.
  // e.g. "2026-05-28T22-00"
  return new Date().toISOString().slice(0, 16).replace(':', '-');
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
    const { slug, url, viewport = { width: 1440, height: 900 }, waitFor = 'networkidle' } = entry;
    const ctx = await browser.newContext({ viewport });
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
      const path = `screenshots/${slug}/${ts}.png`;
      mkdirSync(dirname(path), { recursive: true });
      const buf = await page.screenshot({ fullPage: true, type: 'png' });
      if (!dryRun) writeFileSync(path, buf);
      results.push({ slug, ts, ok: true, bytes: buf.length });
      console.log(`  ok    ${slug}  ${buf.length} bytes  ${Date.now() - start}ms`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ slug, ts, ok: false, error });
      console.log(`  FAIL  ${slug}  ${error}`);
    } finally {
      await ctx.close();
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
