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

export function imageUrl(base: string, slug: string, ts: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}screenshots/${slug}/${ts}.png`;
}

export function manifestUrl(base: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}manifest.json`;
}

export function formatTs(ts: string): string {
  // "2026-05-28T22-00" -> "2026-05-28 22:00"
  const [date, time] = ts.split('T');
  if (!time) return ts;
  return `${date} ${time.replace('-', ':')}`;
}
