import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams, useSearchParams, Navigate } from 'react-router-dom';
import { Compare } from './Compare';
import { SingleView } from './SingleView';
import {
  availableViewports,
  formatTs,
  hasViewport,
  manifestUrl,
  VIEWPORTS,
  type Manifest,
  type ManifestEntry,
  type Viewport,
} from './types';

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
      <header className="page-header">
        <h1>Epoch</h1>
        <p className="muted">Last updated {formatTs(data.generated_at.slice(0, 16).replace(':', '-'))} UTC</p>
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
  const a = params.get('a');
  const b = params.get('b');
  const v = (params.get('v') as Viewport | null) ?? 'desktop';

  if (error) return <Status>Could not load manifest: {error}</Status>;
  if (!data) return <Status>Loading…</Status>;
  const entry: ManifestEntry | undefined = data.urls.find((u) => u.slug === slug);
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

  return (
    <main className="container">
      <header className="page-header">
        <Link to="/" className="back">← all URLs</Link>
        <h1>{entry.slug}</h1>
        <a href={entry.url} target="_blank" rel="noreferrer" className="muted">{entry.url}</a>
      </header>

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
                {vp === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
              </button>
            );
          })}
        </div>
      )}

      <section className="timeline">
        <h2 className="section-title">Captures</h2>
        <div className="timeline__hint muted">
          {!a && 'Click a capture to view it. Click a second one to compare.'}
          {a && !b && (
            <>Viewing {formatTs(a)}. Click another capture to compare. <button className="link" onClick={clear}>clear</button></>
          )}
          {a && b && (
            <>Comparing {formatTs(a)} ↔ {formatTs(b)}. <button className="link" onClick={clear}>clear</button></>
          )}
        </div>
        <ol className="capture-list">
          {entry.captures.map((c) => {
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
                  <span className="capture-btn__ts">{formatTs(c.ts)}</span>
                  {!ok && <span className="capture-btn__error">no {viewport}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {a && !b && hasViewport(entry.captures.find((c) => c.ts === a)!, viewport) && (
        <SingleView slug={slug} viewport={viewport} ts={a} />
      )}
      {a && b && hasViewport(entry.captures.find((c) => c.ts === a)!, viewport) && hasViewport(entry.captures.find((c) => c.ts === b)!, viewport) && (
        <Compare slug={slug} viewport={viewport} tsA={a} tsB={b} />
      )}
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
