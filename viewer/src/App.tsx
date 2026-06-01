import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams, useSearchParams, Navigate } from 'react-router-dom';
import { Compare } from './Compare';
import { formatTs, manifestUrl, type Manifest, type ManifestEntry } from './types';

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
        {data.urls.map((u) => (
          <li key={u.slug}>
            <Link to={`/u/${encodeURIComponent(u.slug)}`} className="url-row">
              <div className="url-row__main">
                <div className="url-row__slug">{u.slug}</div>
                <div className="url-row__url muted">{u.url}</div>
              </div>
              <div className="url-row__meta muted">
                {u.captures.length} captures
                {u.captures[0] ? ` · latest ${formatTs(u.captures[0].ts)}` : ''}
              </div>
            </Link>
          </li>
        ))}
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

  if (error) return <Status>Could not load manifest: {error}</Status>;
  if (!data) return <Status>Loading…</Status>;
  const entry: ManifestEntry | undefined = data.urls.find((u) => u.slug === slug);
  if (!entry) return <Status>Unknown URL slug "{slug}".</Status>;

  const okCaptures = entry.captures.filter((c) => c.ok);

  function pick(ts: string) {
    if (!a) {
      setParams({ a: ts });
    } else if (!b && ts !== a) {
      setParams({ a, b: ts });
    } else {
      setParams({ a: ts });
    }
  }

  return (
    <main className="container">
      <header className="page-header">
        <Link to="/" className="back">← all URLs</Link>
        <h1>{entry.slug}</h1>
        <a href={entry.url} target="_blank" rel="noreferrer" className="muted">{entry.url}</a>
      </header>

      <section className="timeline">
        <h2 className="section-title">Pick two captures to compare</h2>
        <div className="timeline__hint muted">
          {!a && 'Click any capture to pick the first.'}
          {a && !b && (
            <>Pick a second capture. <button className="link" onClick={() => setParams({})}>clear</button></>
          )}
          {a && b && (
            <>Comparing {formatTs(a)} ↔ {formatTs(b)}. <button className="link" onClick={() => setParams({})}>clear</button></>
          )}
        </div>
        <ol className="capture-list">
          {entry.captures.map((c) => {
            const selected = c.ts === a || c.ts === b;
            return (
              <li key={c.ts} className={`capture-row ${selected ? 'is-selected' : ''} ${c.ok ? '' : 'is-failed'}`}>
                <button
                  className="capture-btn"
                  disabled={!c.ok}
                  onClick={() => c.ok && pick(c.ts)}
                  title={c.ok ? '' : c.error}
                >
                  <span className="capture-btn__ts">{formatTs(c.ts)}</span>
                  {!c.ok && <span className="capture-btn__error">failed</span>}
                </button>
              </li>
            );
          })}
          {okCaptures.length === 0 && <li className="muted">No successful captures yet.</li>}
        </ol>
      </section>

      {a && b && <Compare slug={slug} tsA={a} tsB={b} />}
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
