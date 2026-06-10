import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useParams, useSearchParams, Navigate } from 'react-router-dom';
import { AddUrlButton } from './AddUrlButton';
import { Compare } from './Compare';
import { SingleView } from './SingleView';
import { TimelineControls } from './TimelineControls';
import {
  availableViewports,
  formatTs,
  hasViewport,
  manifestUrl,
  tsDateUtc,
  VIEWPORTS,
  withinRange,
  type Capture,
  type Manifest,
  type ManifestEntry,
  type TimeRange,
  type Viewport,
} from './types';

/** Group captures by their UTC date prefix, preserving the input order (newest first). */
function groupByDate(captures: Capture[]): Array<{ date: string; items: Capture[] }> {
  const groups: Array<{ date: string; items: Capture[] }> = [];
  let current: { date: string; items: Capture[] } | null = null;
  for (const c of captures) {
    const d = tsDateUtc(c.ts);
    if (!current || current.date !== d) {
      current = { date: d, items: [] };
      groups.push(current);
    }
    current.items.push(c);
  }
  return groups;
}

/** "Today" / "Yesterday" / "Jun 4" — relative-friendly day label for UTC date. */
function dayLabel(ymd: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (ymd === today) return 'Today';
  const t = new Date(today + 'T00:00:00Z');
  const d = new Date(ymd + 'T00:00:00Z');
  const daysAgo = Math.round((t.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo > 1 && daysAgo < 7) return `${daysAgo}d ago`;
  // Older: "Jun 4"
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "18:21" from a "2026-06-09T18-21" timestamp. */
function timeOnly(ts: string): string {
  const t = ts.split('T')[1];
  return t ? t.replace('-', ':') : ts;
}

function useManifest(): { data: Manifest | null; error: string | null } {
  const [data, setData] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const base = import.meta.env.BASE_URL ?? '/';
    fetch(manifestUrl(base), { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);
  return { data, error };
}

function List() {
  const { data, error } = useManifest();
  if (error) return <Status>Could not load manifest: {error}</Status>;
  if (!data) return <Status>Loading…</Status>;
  if (data.urls.length === 0) return <Status>No URLs tracked yet. Edit <code>urls.json</code>.</Status>;
  return (
    <main className="container">
      <header className="page-header page-header--row">
        <div>
          <h1>Epoch</h1>
          <p className="muted">Last updated {formatTs(data.generated_at.slice(0, 16).replace(':', '-'))} UTC</p>
        </div>
        <AddUrlButton />
      </header>
      <ul className="url-list">
        {data.urls.map((u) => {
          const vps = availableViewports(u);
          const latest = u.captures[0];
          return (
            <li key={u.slug}>
              <Link to={`/u/${encodeURIComponent(u.slug)}`} className="url-row">
                <div className="url-row__main">
                  <div className="url-row__slug">{u.slug}</div>
                  <div className="url-row__url muted">{u.url}</div>
                </div>
                <div className="url-row__meta muted">
                  {u.captures.length} captures
                  {latest ? ` · latest ${formatTs(latest.ts)}` : ''}
                  {vps.length > 0 && ` · ${vps.join(' + ')}`}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function Detail() {
  const { slug = '' } = useParams();
  const { data, error } = useManifest();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<TimeRange>('all');
  const a = params.get('a');
  const b = params.get('b');
  const v = (params.get('v') as Viewport | null) ?? 'desktop';

  // Hooks must run unconditionally — compute inputs even when data isn't ready yet.
  const entry: ManifestEntry | undefined = data?.urls.find((u) => u.slug === slug);
  const filteredCaptures = useMemo<Capture[]>(() => {
    if (!entry) return [];
    return entry.captures.filter((c) => withinRange(c.ts, range));
  }, [entry, range]);
  const groupedCaptures = useMemo(() => groupByDate(filteredCaptures), [filteredCaptures]);

  if (error) return <Status>Could not load manifest: {error}</Status>;
  if (!data) return <Status>Loading…</Status>;
  if (!entry) return <Status>Unknown URL slug "{slug}".</Status>;

  const vps = availableViewports(entry);
  const viewport: Viewport = vps.includes(v) ? v : (vps[0] ?? 'desktop');

  function pick(ts: string) {
    const next = new URLSearchParams(params);
    if (!a) {
      next.set('a', ts);
      next.delete('b');
    } else if (!b && ts !== a) {
      next.set('a', a);
      next.set('b', ts);
    } else {
      next.set('a', ts);
      next.delete('b');
    }
    setParams(next);
  }

  function selectViewport(next: Viewport) {
    const np = new URLSearchParams(params);
    np.set('v', next);
    setParams(np);
  }

  function clear() {
    const np = new URLSearchParams();
    np.set('v', viewport);
    setParams(np);
  }

  function pickTs(slot: 'a' | 'b', ts: string | null) {
    const np = new URLSearchParams(params);
    if (!ts) {
      np.delete(slot);
    } else {
      np.set(slot, ts);
    }
    setParams(np);
  }

  const aCap = a ? entry.captures.find((c) => c.ts === a) : null;
  const bCap = b ? entry.captures.find((c) => c.ts === b) : null;
  const showSingle = !!aCap && !bCap && hasViewport(aCap, viewport);
  const showCompare = !!aCap && !!bCap && hasViewport(aCap, viewport) && hasViewport(bCap, viewport);

  return (
    <main className="container detail">
      <header className="detail__header">
        <div className="detail__title">
          <Link to="/" className="back">← all URLs</Link>
          <h1>{entry.slug}</h1>
          <a href={entry.url} target="_blank" rel="noreferrer" className="muted detail__url">{entry.url}</a>
        </div>
        {vps.length > 1 && (
          <div className="viewport-toggle">
            {VIEWPORTS.map((vp) => {
              const disabled = !vps.includes(vp);
              return (
                <button
                  key={vp}
                  className={`viewport-btn ${viewport === vp ? 'is-active' : ''}`}
                  disabled={disabled}
                  onClick={() => selectViewport(vp)}
                  title={disabled ? `No ${vp} captures yet` : ''}
                >
                  {vp === 'desktop' ? '🖥' : '📱'} {vp}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="detail__sticky">
        <TimelineControls
          range={range}
          onRange={setRange}
          captures={entry.captures}
          viewport={viewport}
          aTs={a}
          bTs={b}
          onPickTs={pickTs}
        />
      </div>

      {/* View pane goes RIGHT under the controls — image is the primary content. */}
      {showSingle && <SingleView slug={slug} viewport={viewport} ts={a!} />}
      {showCompare && <Compare slug={slug} viewport={viewport} tsA={a!} tsB={b!} />}
      {!showSingle && !showCompare && (
        <section className="detail__empty muted">
          Pick a date above (or a capture below) to view a screenshot. Pick two to compare.
        </section>
      )}

      {/* Capture history — secondary, below the image. Grouped by day so 20+ captures stay scannable. */}
      <section className="history">
        <header className="history__header">
          <h2 className="section-title">History</h2>
          <span className="muted history__count">
            {filteredCaptures.length} of {entry.captures.length} captures
            {range !== 'all' && ` · ${range}`}
          </span>
          {(a || b) && <button className="link history__clear" onClick={clear}>clear selection</button>}
        </header>
        {filteredCaptures.length === 0 ? (
          <p className="muted history__empty">No captures in this range. Try "All" or a wider window.</p>
        ) : (
          <div className="history__groups">
            {groupedCaptures.map((g) => (
              <div className="history__group" key={g.date}>
                <div className="history__group-label">
                  <span className="history__group-name">{dayLabel(g.date)}</span>
                  <span className="muted history__group-date">{g.date}</span>
                  <span className="muted history__group-count">· {g.items.length}</span>
                </div>
                <ol className="capture-list">
                  {g.items.map((c) => {
                    const selected = c.ts === a || c.ts === b;
                    const ok = hasViewport(c, viewport);
                    const result = c.viewports[viewport];
                    return (
                      <li key={c.ts} className={`capture-row ${selected ? 'is-selected' : ''} ${ok ? '' : 'is-failed'}`}>
                        <button
                          className="capture-btn"
                          disabled={!ok}
                          onClick={() => ok && pick(c.ts)}
                          title={!ok && result && result.ok === false ? result.error : (!ok ? `Not captured at ${viewport}` : '')}
                        >
                          <span className="capture-btn__ts">{timeOnly(c.ts)}</span>
                          {!ok && <span className="capture-btn__error">no {viewport}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return <main className="container"><p className="status">{children}</p></main>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<List />} />
      <Route path="/u/:slug" element={<Detail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
