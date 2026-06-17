import { formatTs, imageUrl, type Viewport } from './types';

type Props = {
  slug: string;
  viewport: Viewport;
  ts: string;
  onPrev?: () => void;
  onNext?: () => void;
};

export function SingleView({ slug, viewport, ts, onPrev, onNext }: Props) {
  const base = import.meta.env.BASE_URL ?? '/';
  const src = imageUrl(base, slug, viewport, ts);

  return (
    <section className="compare">
      <header className="compare__bar">
        <div className="step-group">
          <button
            type="button"
            className="step-btn"
            disabled={!onPrev}
            onClick={onPrev}
            title="Older capture (←)"
            aria-label="Older capture"
          >
            ←
          </button>
          <h2 className="section-title">Viewing {formatTs(ts)} · {viewport}</h2>
          <button
            type="button"
            className="step-btn"
            disabled={!onNext}
            onClick={onNext}
            title="Newer capture (→)"
            aria-label="Newer capture"
          >
            →
          </button>
        </div>
        <a href={src} target="_blank" rel="noreferrer" className="muted">open full-size ↗</a>
      </header>
      <div className={`single-pane single-pane--${viewport}`}>
        <img src={src} alt={`${slug} at ${ts} (${viewport})`} className="compare__img" />
      </div>
    </section>
  );
}
