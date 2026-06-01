import { useEffect, useRef, useState } from 'react';
import { VIEWPORTS, type Viewport } from './types';

// Hardcoded — the form opens a new Issue against this repo with the `add-url`
// label, and the .github/workflows/add-url.yml workflow handles the rest.
const REPO = 'ankit-jsr/epoch';

type FormState = {
  slug: string;
  url: string;
  viewports: Viewport[];
  waitFor: 'networkidle' | 'domcontentloaded' | 'load';
};

const INITIAL: FormState = {
  slug: '',
  url: '',
  viewports: [...VIEWPORTS],
  waitFor: 'networkidle',
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function validate(state: FormState): string | null {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(state.slug)) {
    return 'Slug must be lowercase kebab-case (e.g. kapiva-shilajit), 1-64 chars.';
  }
  try {
    const u = new URL(state.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'URL must start with http:// or https://';
    }
  } catch {
    return 'URL is not valid.';
  }
  if (state.viewports.length === 0) {
    return 'Pick at least one viewport.';
  }
  return null;
}

function buildIssueUrl(state: FormState): string {
  const payload: Record<string, unknown> = {
    slug: state.slug,
    url: state.url,
    viewports: state.viewports,
  };
  if (state.waitFor !== 'networkidle') payload.waitFor = state.waitFor;

  const body = [
    `Adding a new URL to Epoch via the viewer form.`,
    ``,
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    ``,
    `The \`add-url\` workflow will validate this, append it to \`urls.json\`, commit, and close this issue.`,
  ].join('\n');

  const params = new URLSearchParams({
    title: `Add URL: ${state.slug}`,
    body,
    labels: 'add-url',
  });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}

export function AddUrlButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(INITIAL);
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function autoSlug(url: string) {
    setState((s) => {
      if (!s.slug || s.slug === slugify(s.url)) {
        return { ...s, url, slug: slugify(url) };
      }
      return { ...s, url };
    });
  }

  function toggleViewport(v: Viewport) {
    setState((s) => ({
      ...s,
      viewports: s.viewports.includes(v) ? s.viewports.filter((x) => x !== v) : [...s.viewports, v],
    }));
  }

  function reset() {
    setState(INITIAL);
    setTouched(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    const err = validate(state);
    if (err) return;
    const issueUrl = buildIssueUrl(state);
    window.open(issueUrl, '_blank', 'noopener,noreferrer');
    setOpen(false);
    reset();
  }

  const err = touched ? validate(state) : null;

  return (
    <>
      <button className="add-url-btn" onClick={() => setOpen(true)}>+ Add URL</button>
      <dialog
        ref={dialogRef}
        className="add-url-dialog"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Click on the backdrop (the dialog element itself, not its child form) closes.
          if (e.target === dialogRef.current) setOpen(false);
        }}
      >
        <form className="add-url-form" onSubmit={submit}>
          <header className="add-url-form__header">
            <h2>Add URL</h2>
            <button type="button" className="link" onClick={() => setOpen(false)}>close</button>
          </header>

          <div className="add-url-form__steps">
            <strong>How this works</strong>
            <ol>
              <li>This form opens a pre-filled GitHub Issue in a new tab.</li>
              <li>You click <strong>Submit new issue</strong> on GitHub.</li>
              <li>A workflow validates it, adds the URL to <code>urls.json</code>, and closes the issue automatically.</li>
              <li>The URL appears here on the next capture run (or trigger one manually).</li>
            </ol>
            <small className="muted">Only repo collaborators can add URLs — GitHub handles the auth.</small>
          </div>

          <label className="add-url-form__field">
            <span>URL</span>
            <input
              type="url"
              autoFocus
              placeholder="https://kapiva.in/products/shilajit"
              value={state.url}
              onChange={(e) => autoSlug(e.target.value)}
              required
            />
          </label>

          <label className="add-url-form__field">
            <span>Slug</span>
            <input
              type="text"
              placeholder="kapiva-shilajit"
              value={state.slug}
              onChange={(e) => setState((s) => ({ ...s, slug: e.target.value }))}
              required
              pattern="[a-z0-9][a-z0-9\-]{0,63}"
            />
            <small className="muted">
              Identifier used for the storage path and viewer URL. Auto-generated from the URL —
              edit if you want.
            </small>
          </label>

          <fieldset className="add-url-form__field">
            <legend>Capture at</legend>
            <div className="add-url-form__checks">
              {VIEWPORTS.map((vp) => (
                <label key={vp}>
                  <input
                    type="checkbox"
                    checked={state.viewports.includes(vp)}
                    onChange={() => toggleViewport(vp)}
                  />
                  {vp === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="add-url-form__field">
            <span>Wait strategy</span>
            <select
              value={state.waitFor}
              onChange={(e) => setState((s) => ({ ...s, waitFor: e.target.value as FormState['waitFor'] }))}
            >
              <option value="networkidle">networkidle (default; most sites)</option>
              <option value="domcontentloaded">domcontentloaded (SPAs that never go idle)</option>
              <option value="load">load (fastest, may miss async content)</option>
            </select>
          </label>

          {err && <div className="add-url-form__error">{err}</div>}

          <footer className="add-url-form__footer">
            <button type="button" className="link" onClick={() => { reset(); setOpen(false); }}>cancel</button>
            <button type="submit" className="add-url-form__submit">
              Continue to GitHub →
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
