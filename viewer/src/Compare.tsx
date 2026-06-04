import { useEffect, useRef, useState } from 'react';
import pixelmatch from 'pixelmatch';
import { formatTs, imageUrl, type Viewport } from './types';

type Props = { slug: string; viewport: Viewport; tsA: string; tsB: string };

type DiffState =
  | { kind: 'idle' }
  | { kind: 'computing' }
  | {
      kind: 'ready';
      mismatched: number;
      total: number;
      dataUrl: string;
      // Dimensions of the diffed region. May be smaller than either image
      // when they differ — we crop both to min(w, h) so the diff still
      // produces useful output instead of refusing entirely.
      w: number;
      h: number;
      origA: { w: number; h: number };
      origB: { w: number; h: number };
    }
  | { kind: 'wildly_different'; aw: number; ah: number; bw: number; bh: number }
  | { kind: 'error'; message: string };

/** Load PNG/JPEG into an ImageData clipped to (w, h) at top-left.
 *  When w/h are smaller than the image, the bottom/right is dropped. */
async function loadImageData(src: string, w?: number, h?: number): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const cropW = w ?? img.naturalWidth;
  const cropH = h ?? img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = cropW;
  c.height = cropH;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, cropW, cropH);
}

/** Get the natural dimensions of an image at a URL. */
async function imgDimensions(src: string): Promise<{ w: number; h: number }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  return { w: img.naturalWidth, h: img.naturalHeight };
}

export function Compare({ slug, viewport, tsA, tsB }: Props) {
  const base = import.meta.env.BASE_URL ?? '/';
  const aUrl = imageUrl(base, slug, viewport, tsA);
  const bUrl = imageUrl(base, slug, viewport, tsB);

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
      // First check dimensions without decoding to ImageData (saves memory).
      const [origA, origB] = await Promise.all([imgDimensions(aUrl), imgDimensions(bUrl)]);

      // If widths differ by more than a tiny rounding amount, the captures
      // came from incompatible viewport settings (e.g. the DPR=3→2 cutover
      // on June 2). A meaningful pixel diff isn't possible.
      const widthDelta = Math.abs(origA.w - origB.w);
      if (widthDelta > 8) {
        setDiff({
          kind: 'wildly_different',
          aw: origA.w, ah: origA.h, bw: origB.w, bh: origB.h,
        });
        return;
      }

      // Crop both to common dimensions. Widths agree (within tolerance),
      // heights often differ because mobile pages stack content vertically
      // and lazy-loaded sections vary. Diff only the overlapping top region.
      const w = Math.min(origA.w, origB.w);
      const h = Math.min(origA.h, origB.h);

      const [imgA, imgB] = await Promise.all([
        loadImageData(aUrl, w, h),
        loadImageData(bUrl, w, h),
      ]);

      const diffCanvas = document.createElement('canvas');
      diffCanvas.width = w; diffCanvas.height = h;
      const ctx = diffCanvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      const out = ctx.createImageData(w, h);
      const mismatched = pixelmatch(imgA.data, imgB.data, out.data, w, h, {
        // 0.2 — bumped from 0.15 after dropping JPEG quality to 75 (which has
        // more quantization noise than 85). Without this, unchanged pages
        // show faint static. 0.2 still catches real visual changes; if a
        // change is too subtle to read at 0.2, you probably wouldn't notice
        // it visually anyway.
        threshold: 0.2,
        includeAA: false,
        alpha: 0,
        diffColor: [255, 0, 0],
      });
      ctx.putImageData(out, 0, 0);
      setDiff({
        kind: 'ready',
        mismatched,
        total: w * h,
        dataUrl: diffCanvas.toDataURL('image/png'),
        w, h,
        origA, origB,
      });
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
        <h2 className="section-title">Compare · {viewport}</h2>
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
              {diff.origA.h !== diff.origB.h && (
                <> · diffed top {diff.h.toLocaleString()} px (A is {diff.origA.h.toLocaleString()}, B is {diff.origB.h.toLocaleString()})</>
              )}
            </span>
          )}
          {diff.kind === 'wildly_different' && (
            <span className="muted error">
              widths differ ({diff.aw}×{diff.ah} vs {diff.bw}×{diff.bh}) — captures use incompatible
              viewport settings (likely pre/post the June 2 mobile DPR change). Pick two captures
              from the same era to diff.
            </span>
          )}
          {diff.kind === 'error' && <span className="muted error">{diff.message}</span>}
        </div>
      </header>
      <div className={`compare__grid compare__grid--${viewport}`}>
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
              <img
                src={diff.dataUrl}
                alt="diff"
                className="compare__diff"
                // Match the diff image's natural pixel dimensions to the
                // image B layout: same width, height proportional to the
                // diffed-vs-B ratio. Anchored top-left so the diff covers
                // the overlapping region and the un-diffed bottom (if B is
                // taller) stays visible underneath.
                style={{
                  width: '100%',
                  height: `${(diff.h / diff.origB.h) * 100}%`,
                  top: 0,
                  left: 0,
                  bottom: 'auto',
                  right: 'auto',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
