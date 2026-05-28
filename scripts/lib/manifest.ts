import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export type UrlEntry = {
  slug: string;
  url: string;
  viewport?: { width: number; height: number };
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
};

export type Capture =
  | { ts: string; ok: true; bytes: number }
  | { ts: string; ok: false; error: string };

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

export type CaptureResult = { slug: string } & Capture;

export function mergeCaptures(
  manifest: Manifest,
  urls: UrlEntry[],
  results: CaptureResult[],
): Manifest {
  return {
    generated_at: new Date().toISOString(),
    urls: urls.map((u) => {
      const existing = manifest.urls.find((m) => m.slug === u.slug);
      const newOnes: Capture[] = results
        .filter((r) => r.slug === u.slug)
        .map(({ slug: _slug, ...rest }) => rest as Capture);
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
