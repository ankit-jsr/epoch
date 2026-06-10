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
      // Dimensions of the diffed region in image-B's coordinate space.
      w: number;
      h: number;
      origA: { w: number; h: number };
      origB: { w: number; h: number };
      // True when one image was resized to match the other (cross-DPR diff).
      // Surfaces a hint in the UI that some "changed" pixels are rendering
      // artifacts, not real content changes.
      resized: boolean;
    }
  | { kind: 'error'; message: string };

/**
 * Load an image, optionally rendering it into a canvas of size (targetW, targetH).
 * When the target size differs from natural size, the image is scaled by canvas
 * with high-quality smoothing. When omitted, returns the image at native size
 * cropped to (cropW, cropH) at top-left.
 */
async function loadImageData(
  src: string,
  opts: { targetW?: number; targetH?: number; cropW?: number; cropH?: number } = {},
): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const w = opts.targetW ?? opts.cropW ?? img.naturalWidth;
  const h = opts.targetH ?? opts.cropH ?? img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  if (opts.targetW !== undefined || opts.targetH !== undefined) {
    // Resize-mode: draw the whole image scaled to the target canvas.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    // Crop-mode: draw at native scale, canvas size clips bottom/right.
    ctx.drawImage(img, 0, 0);
  }
  return ctx.getImageData(0, 0, w, h);
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

      // Normalize to a common width so pixelmatch can compare pixel-for-pixel.
      // Strategy: scale the larger image DOWN to match the smaller (never upscale
      // — that would amplify JPEG artifacts and yield false positives everywhere).
      // Heights scale proportionally to preserve aspect ratio.
      const targetW = Math.min(origA.w, origB.w);
      const widthDelta = Math.abs(origA.w - origB.w);
      const resized = widthDelta > 8;

      const aScaledH = origA.w === targetW ? origA.h : Math.round(origA.h * (targetW / origA.w));
      const bScaledH = origB.w === targetW ? origB.h : Math.round(origB.h * (targetW / origB.w));
      // Final diff height: shorter of the two scaled images. The taller one's
      // bottom region isn't diffed (it's content the other capture doesn't have).
      const h = Math.min(aScaledH, bScaledH);

      // Load each side at the target dimensions. If width already matches,
      // we crop to h instead of resizing (preserves the original pixel data).
      const [imgA, imgB] = await Promise.all([
        origA.w === targetW
          ? loadImageData(aUrl, { cropW: targetW, cropH: h })
          : loadImageData(aUrl, { targetW, targetH: h }),
        origB.w === targetW
          ? loadImageData(bUrl, { cropW: targetW, cropH: h })
          : loadImageData(bUrl, { targetW, targetH: h }),
      ]);

      const diffCanvas = document.createElement('canvas');
      diffCanvas.width = targetW; diffCanvas.height = h;
      const ctx = diffCanvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      const out = ctx.createImageData(targetW, h);
      const mismatched = pixelmatch(imgA.data, imgB.data, out.data, targetW, h, {
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
        total: targetW * h,
        dataUrl: diffCanvas.toDataURL('image/png'),
        w: targetW,
        h,
        origA,
        origB,
        resized,
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
              {diff.resized && (
                <> · resized to {diff.w}px wide for comparison (A was {diff.origA.w}, B was {diff.origB.w}) — expect baseline noise from different render resolutions</>
              )}
              {!diff.resized && diff.origA.h !== diff.origB.h && (
                <> · diffed top {diff.h.toLocaleString()} px (A is {diff.origA.h.toLocaleString()}, B is {diff.origB.h.toLocaleString()})</>
              )}
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
                // Diff is in (targetW × h) coordinates. Image B is displayed
                // at 100% pane width but represents (origB.w × origB.h) of
                // content. Map the diff to image B's space:
                //   - width: 100% (we resized B's width range to targetW
                //     conceptually; visually img B fills the pane)
                //   - height: ratio of diff height to B's scaled height
                style={{
                  width: '100%',
                  height: `${(diff.h / (diff.resized ? (diff.origB.h * diff.w / diff.origB.w) : diff.origB.h)) * 100}%`,
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
