import { useEffect, useRef, useState } from 'react';
import pixelmatch from 'pixelmatch';
import { formatTs, imageUrl } from './types';

type Props = { slug: string; tsA: string; tsB: string };

type DiffState =
  | { kind: 'idle' }
  | { kind: 'computing' }
  | { kind: 'ready'; mismatched: number; total: number; dataUrl: string }
  | { kind: 'mismatch'; aw: number; ah: number; bw: number; bh: number }
  | { kind: 'error'; message: string };

async function loadImageData(src: string): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

export function Compare({ slug, tsA, tsB }: Props) {
  const base = import.meta.env.BASE_URL ?? '/';
  const aUrl = imageUrl(base, slug, tsA);
  const bUrl = imageUrl(base, slug, tsB);

  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff] = useState<DiffState>({ kind: 'idle' });
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  // Scroll-lock the two side-by-side panes.
  useEffect(() => {
    const a = aRef.current, b = bRef.current;
    if (!a || !b) return;
    const sync = (from: HTMLDivElement, to: HTMLDivElement) => () => {
      if (syncing.current) return;
      syncing.current = true;
      to.scrollTop = from.scrollTop;
      to.scrollLeft = from.scrollLeft;
      syncing.current = false;
    };
    const onA = sync(a, b);
    const onB = sync(b, a);
    a.addEventListener('scroll', onA);
    b.addEventListener('scroll', onB);
    return () => {
      a.removeEventListener('scroll', onA);
      b.removeEventListener('scroll', onB);
    };
  }, []);

  async function computeDiff() {
    setDiff({ kind: 'computing' });
    try {
      const [imgA, imgB] = await Promise.all([loadImageData(aUrl), loadImageData(bUrl)]);
      if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
        setDiff({
          kind: 'mismatch',
          aw: imgA.width, ah: imgA.height,
          bw: imgB.width, bh: imgB.height,
        });
        return;
      }
      const w = imgA.width, h = imgA.height;
      const diffCanvas = document.createElement('canvas');
      diffCanvas.width = w; diffCanvas.height = h;
      const ctx = diffCanvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      const out = ctx.createImageData(w, h);
      const mismatched = pixelmatch(imgA.data, imgB.data, out.data, w, h, {
        threshold: 0.1,
        includeAA: false,
        alpha: 0,
        diffColor: [255, 0, 0],
      });
      ctx.putImageData(out, 0, 0);
      setDiff({ kind: 'ready', mismatched, total: w * h, dataUrl: diffCanvas.toDataURL('image/png') });
    } catch (e) {
      setDiff({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  function toggleDiff() {
    const next = !showDiff;
    setShowDiff(next);
    if (next && diff.kind === 'idle') computeDiff();
  }

  // Recompute when timestamps change.
  useEffect(() => {
    setDiff({ kind: 'idle' });
    setShowDiff(false);
  }, [aUrl, bUrl]);

  return (
    <section className="compare">
      <header className="compare__bar">
        <h2 className="section-title">Compare</h2>
        <div className="compare__toggle">
          <label>
            <input type="checkbox" checked={showDiff} onChange={toggleDiff} />
            <span>Diff overlay</span>
          </label>
          {diff.kind === 'computing' && <span className="muted">computing…</span>}
          {diff.kind === 'ready' && (
            <span className="muted">
              {diff.mismatched.toLocaleString()} / {diff.total.toLocaleString()} px changed
              ({((diff.mismatched / diff.total) * 100).toFixed(2)}%)
            </span>
          )}
          {diff.kind === 'mismatch' && (
            <span className="muted error">
              size mismatch ({diff.aw}×{diff.ah} vs {diff.bw}×{diff.bh}) — can't diff different-size captures
            </span>
          )}
          {diff.kind === 'error' && <span className="muted error">{diff.message}</span>}
        </div>
      </header>
      <div className="compare__grid">
        <div className="compare__pane" ref={aRef}>
          <div className="compare__label">{formatTs(tsA)}</div>
          <div className="compare__img-wrap">
            <img src={aUrl} alt={`${slug} at ${tsA}`} className="compare__img" />
          </div>
        </div>
        <div className="compare__pane" ref={bRef}>
          <div className="compare__label">{formatTs(tsB)}</div>
          <div className="compare__img-wrap">
            <img src={bUrl} alt={`${slug} at ${tsB}`} className="compare__img" />
            {showDiff && diff.kind === 'ready' && (
              <img src={diff.dataUrl} alt="diff" className="compare__diff" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
