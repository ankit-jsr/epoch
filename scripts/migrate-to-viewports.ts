/**
 * One-shot migration: move existing flat-layout screenshots into
 *   screenshots/{slug}/{ts}.png  →  screenshots/{slug}/desktop/{ts}.png
 * and rewrite manifest.json entries from the old flat shape to the new
 * per-viewport shape (treating existing captures as desktop-only).
 *
 * Idempotent — re-running is a no-op once everything's migrated.
 */
import {
  readdirSync,
  statSync,
  renameSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

type OldCapture = { ts: string; ok: boolean; bytes?: number; error?: string };
type OldManifest = {
  generated_at: string;
  urls: Array<{ slug: string; url: string; captures: OldCapture[] }>;
};
type NewCapture = {
  ts: string;
  viewports: { desktop?: { ok: true; bytes: number } | { ok: false; error: string } };
};
type NewManifest = {
  generated_at: string;
  urls: Array<{ slug: string; url: string; captures: NewCapture[] }>;
};

function migrateFiles(): void {
  const root = 'screenshots';
  if (!existsSync(root)) {
    console.log('no screenshots/ directory — nothing to migrate');
    return;
  }
  for (const slug of readdirSync(root)) {
    const slugDir = `${root}/${slug}`;
    if (!statSync(slugDir).isDirectory()) continue;
    const entries = readdirSync(slugDir);
    const pngs = entries.filter((n) => n.endsWith('.png'));
    if (pngs.length === 0) continue;
    const desktopDir = `${slugDir}/desktop`;
    mkdirSync(desktopDir, { recursive: true });
    for (const png of pngs) {
      const from = `${slugDir}/${png}`;
      const to = `${desktopDir}/${png}`;
      if (existsSync(to)) {
        console.log(`  skip ${from} (already at ${to})`);
        continue;
      }
      renameSync(from, to);
      console.log(`  moved ${from} -> ${to}`);
    }
  }
}

function migrateManifest(): void {
  if (!existsSync('manifest.json')) {
    console.log('no manifest.json — nothing to migrate');
    return;
  }
  const raw = JSON.parse(readFileSync('manifest.json', 'utf-8')) as OldManifest | NewManifest;
  // Detect already-migrated by looking for `viewports` on any capture.
  const firstCap = raw.urls[0]?.captures[0];
  if (firstCap && 'viewports' in firstCap) {
    console.log('manifest already in viewport form — skipping');
    return;
  }
  const old = raw as OldManifest;
  const next: NewManifest = {
    generated_at: old.generated_at,
    urls: old.urls.map((u) => ({
      slug: u.slug,
      url: u.url,
      captures: u.captures.map((c): NewCapture => {
        const result =
          c.ok && typeof c.bytes === 'number'
            ? { ok: true as const, bytes: c.bytes }
            : { ok: false as const, error: c.error ?? 'unknown' };
        return { ts: c.ts, viewports: { desktop: result } };
      }),
    })),
  };
  writeFileSync('manifest.json', JSON.stringify(next, null, 2) + '\n', 'utf-8');
  console.log('manifest.json migrated to viewport form');
}

migrateFiles();
migrateManifest();
console.log('done');
