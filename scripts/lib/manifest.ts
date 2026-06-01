import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export type Viewport = 'desktop' | 'mobile';
export const VIEWPORTS: Viewport[] = ['desktop', 'mobile'];

export type UrlEntry = {
  slug: string;
  url: string;
  viewport?: { width: number; height: number };
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  // Restrict to a subset of viewports if a URL only makes sense in one.
  // Defaults to both desktop + mobile.
  viewports?: Viewport[];
};

export type ViewportResult =
  | { ok: true; bytes: number }
  | { ok: false; error: string };

export type Capture = {
  ts: string;
  // viewport name -> result. Missing keys mean "not captured at this viewport".
  viewports: Partial<Record<Viewport, ViewportResult>>;
};

export type ManifestEntry = {
  slug: string;
  url: string;
  captures: Capture[];
};

export type Manifest = {
  generated_at: string;
  urls: ManifestEntry[];
};

const PATH = 'manifest.json';

export function readManifest(): Manifest {
  if (!existsSync(PATH)) {
    return { generated_at: new Date().toISOString(), urls: [] };
  }
  return JSON.parse(readFileSync(PATH, 'utf-8')) as Manifest;
}

export type CaptureResult = {
  slug: string;
  ts: string;
  viewport: Viewport;
} & ViewportResult;

/** Merge per-viewport results into the manifest, grouping by (slug, ts). */
export function mergeCaptures(
  manifest: Manifest,
  urls: UrlEntry[],
  results: CaptureResult[],
): Manifest {
  return {
    generated_at: new Date().toISOString(),
    urls: urls.map((u) => {
      const existing = manifest.urls.find((m) => m.slug === u.slug);
      // Group new results for this slug by ts so a single (slug, ts) gets
      // both desktop+mobile in one capture entry.
      const newByTs = new Map<string, Capture>();
      for (const r of results) {
        if (r.slug !== u.slug) continue;
        let cap = newByTs.get(r.ts);
        if (!cap) {
          cap = { ts: r.ts, viewports: {} };
          newByTs.set(r.ts, cap);
        }
        const { ok } = r;
        cap.viewports[r.viewport] = ok
          ? { ok: true, bytes: r.bytes }
          : { ok: false, error: r.error };
      }
      const newOnes = [...newByTs.values()];
      return {
        slug: u.slug,
        url: u.url,
        captures: [...newOnes, ...(existing?.captures ?? [])],
      };
    }),
  };
}

export function writeManifest(m: Manifest): void {
  writeFileSync(PATH, JSON.stringify(m, null, 2) + '\n', 'utf-8');
}
