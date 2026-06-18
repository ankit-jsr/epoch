import { useEffect, useState } from 'react';
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
  stepCapture,
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
  const a = params.get('a');
  const b = params.get('b');
  const v = (params.get('v') as Viewport | null) ?? 'desktop';

  // Hooks must run unconditionally.
  const entry: ManifestEntry | undefined = data?.urls.find((u) => u.slug === slug);
  const vps = entry ? availableViewports(entry) : [];
  const viewport: Viewport = vps.includes(v) ? v : (vps[0] ?? 'desktop');

  // Keyboard nav: ←/→ step the "active" pane.
  // Single-view: steps `a`. Compare: ←/→ steps b (the "moving" side);
  // Shift+←/→ steps a.
  useEffect(() => {
    if (!entry) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // Recompute neighbors inside the handler so we always work off the
      // current entry+viewport without coupling the effect to step* state.
      const hasA = !!a;
      const hasB = !!b;
      // If only a is set OR Shift held → step a. Otherwise → step b.
      const slotToStep: 'a' | 'b' = (!hasB || e.shiftKey) ? 'a' : 'b';
      const ts = slotToStep === 'a' ? a : b;
      if (!ts) return;

      const direction: 'newer' | 'older' = e.key === 'ArrowLeft' ? 'older' : 'newer';
      const neighbor = stepCapture(entry!.captures, ts, direction, viewport);
      if (!neighbor) return;
      e.preventDefault();
      // setParams via the same path as pickTs.
      const np = new URLSearchParams(params);
      np.set(slotToStep, neighbor.ts);
      setParams(np);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, viewport, a, b, params, setParams]);

  if (error) return <Status>Could not load manifest: {error}</Status>;
  if (!data) return <Status>Loading…</Status>;
  if (!entry) return <Status>Unknown URL slug "{slug}".</Status>;

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

  // Atomic update of both slots in a single setParams call. Required for
  // any path that needs to change `a` AND `b` at the same time — calling
  // pickTs twice in a row clobbers itself because both calls read the
  // same stale URLSearchParams (React hasn't re-rendered yet).
  function pickBoth(aTs: string | null, bTs: string | null) {
    const np = new URLSearchParams(params);
    if (aTs === null) np.delete('a'); else np.set('a', aTs);
    if (bTs === null) np.delete('b'); else np.set('b', bTs);
    setParams(np);
  }

  const aCap = a ? entry.captures.find((c) => c.ts === a) : null;
  const bCap = b ? entry.captures.find((c) => c.ts === b) : null;
  const showSingle = !!aCap && !bCap && hasViewport(aCap, viewport);
  const showCompare = !!aCap && !!bCap && hasViewport(aCap, viewport) && hasViewport(bCap, viewport);

  // Step helpers — return null if neighbor doesn't exist (button gets disabled).
  function stepperFor(ts: string | null, slot: 'a' | 'b'): { prev?: () => void; next?: () => void } {
    if (!ts) return {};
    const older = stepCapture(entry!.captures, ts, 'older', viewport);
    const newer = stepCapture(entry!.captures, ts, 'newer', viewport);
    return {
      prev: older ? () => pickTs(slot, older.ts) : undefined,
      next: newer ? () => pickTs(slot, newer.ts) : undefined,
    };
  }
  const stepA = stepperFor(a, 'a');
  const stepB = stepperFor(b, 'b');

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
          captures={entry.captures}
          viewport={viewport}
          aTs={a}
          bTs={b}
          onPickTs={pickTs}
          onPickBoth={pickBoth}
          onClear={(a || b) ? clear : undefined}
        />
      </div>

      {/* Image is the primary content. View pane sits right under controls
          and takes whatever vertical space the screenshot needs. */}
      {showSingle && (
        <SingleView
          slug={slug}
          viewport={viewport}
          ts={a!}
          onPrev={stepA.prev}
          onNext={stepA.next}
        />
      )}
      {showCompare && (
        <Compare
          slug={slug}
          viewport={viewport}
          tsA={a!}
          tsB={b!}
          onStepA={stepA}
          onStepB={stepB}
        />
      )}
      {!showSingle && !showCompare && (
        <section className="detail__empty muted">
          Pick a date above to view a screenshot. Pick two to compare them.
        </section>
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
