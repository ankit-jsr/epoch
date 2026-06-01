import { formatTs, imageUrl, type Viewport } from './types';

type Props = { slug: string; viewport: Viewport; ts: string };

export function SingleView({ slug, viewport, ts }: Props) {
  const base = import.meta.env.BASE_URL ?? '/';
  const src = imageUrl(base, slug, viewport, ts);

  return (
    <section className="compare">
      <header className="compare__bar">
        <h2 className="section-title">Viewing {formatTs(ts)} · {viewport}</h2>
        <a href={src} target="_blank" rel="noreferrer" className="muted">open full-size ↗</a>
      </header>
      <div className={`single-pane single-pane--${viewport}`}>
        <img src={src} alt={`${slug} at ${ts} (${viewport})`} className="compare__img" />
      </div>
    </section>
  );
}
