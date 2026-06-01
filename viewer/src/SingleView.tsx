import { formatTs, imageUrl } from './types';

type Props = { slug: string; ts: string };

export function SingleView({ slug, ts }: Props) {
  const base = import.meta.env.BASE_URL ?? '/';
  const src = imageUrl(base, slug, ts);

  return (
    <section className="compare">
      <header className="compare__bar">
        <h2 className="section-title">Viewing {formatTs(ts)}</h2>
        <a href={src} target="_blank" rel="noreferrer" className="muted">open full-size ↗</a>
      </header>
      <div className="single-pane">
        <img src={src} alt={`${slug} at ${ts}`} className="compare__img" />
      </div>
    </section>
  );
}
