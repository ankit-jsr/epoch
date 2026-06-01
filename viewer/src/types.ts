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

/** Convert capture ts ("2026-06-01T07-50") to a Date object (UTC). */
export function parseTs(ts: string): Date {
  // Re-introduce the colon stripped at capture time so the string is a valid ISO.
  const [d, t] = ts.split('T');
  if (!t) return new Date(d);
  const fixed = `${d}T${t.replace('-', ':')}:00Z`;
  return new Date(fixed);
}

/** "YYYY-MM-DD" — local-day form, suitable for <input type="date"> value. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Just the YYYY-MM-DD prefix of a capture's UTC ts. */
export function tsDateUtc(ts: string): string {
  return ts.slice(0, 10);
}

export type TimeRange = 'all' | 'today' | '7d' | '30d';

export function withinRange(ts: string, range: TimeRange): boolean {
  if (range === 'all') return true;
  const captureDate = parseTs(ts);
  const now = new Date();
  if (range === 'today') {
    return tsDateUtc(ts) === tsDateUtc(now.toISOString().replace(':', '-'));
  }
  const days = range === '7d' ? 7 : 30;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return captureDate.getTime() >= cutoff;
}

/** Latest capture (by ts desc) on a given UTC date that has the given viewport. */
export function findCaptureOnDate(
  captures: Capture[],
  dateYmd: string,
  viewport: Viewport,
): Capture | null {
  for (const c of captures) {
    if (tsDateUtc(c.ts) === dateYmd && hasViewport(c, viewport)) return c;
  }
  return null;
}
