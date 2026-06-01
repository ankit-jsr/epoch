export type Viewport = 'desktop' | 'mobile';
export const VIEWPORTS: Viewport[] = ['desktop', 'mobile'];

export type ViewportResult =
  | { ok: true; bytes: number }
  | { ok: false; error: string };

export type Capture = {
  ts: string;
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

export function imageUrl(base: string, slug: string, viewport: Viewport, ts: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}screenshots/${slug}/${viewport}/${ts}.jpg`;
}

export function manifestUrl(base: string): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}manifest.json`;
}

export function formatTs(ts: string): string {
  const [date, time] = ts.split('T');
  if (!time) return ts;
  return `${date} ${time.replace('-', ':')}`;
}

/** Check whether a given viewport actually has a screenshot for this capture. */
export function hasViewport(c: Capture, v: Viewport): boolean {
  const r = c.viewports[v];
  return !!r && r.ok === true;
}

/** Pick the best default viewport for a capture (prefer desktop, fall back). */
export function defaultViewport(c: Capture): Viewport {
  if (hasViewport(c, 'desktop')) return 'desktop';
  if (hasViewport(c, 'mobile')) return 'mobile';
  return 'desktop';
}

/** Which viewports does this URL have at least one successful capture in? */
export function availableViewports(entry: ManifestEntry): Viewport[] {
  const set = new Set<Viewport>();
  for (const c of entry.captures) {
    for (const v of VIEWPORTS) if (hasViewport(c, v)) set.add(v);
  }
  return VIEWPORTS.filter((v) => set.has(v));
}
