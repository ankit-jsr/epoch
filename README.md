# Epoch — Website Screenshot Tracker

> A point-in-time archive for any URL. Captures three snapshots a day, lets you compare any two moments.


Captures a list of URLs three times per day via GitHub Actions, commits the
PNGs back to this repo, and serves a viewer (Vite + React) on GitHub Pages
that lets you pick two timestamps and visually diff a page.

No third-party storage, no DB, no secrets to manage beyond what GitHub gives
you for free.

## How it works

```
.github/workflows/capture.yml      cron 06:00 / 14:00 / 22:00 UTC
   └─ scripts/capture.ts (Playwright)
         ├─ reads urls.json
         ├─ writes screenshots/{slug}/{ISO-timestamp}.png
         ├─ updates manifest.json
         └─ git add / commit / push  (uses built-in GITHUB_TOKEN)

.github/workflows/deploy.yml       on push to main
   └─ builds /viewer and deploys to GitHub Pages
         (manifest.json + screenshots/ are copied alongside the bundle)
```

## Configure URLs

Edit `urls.json` — that's the source of truth. Add, remove, or change entries
freely; the capture script reads it on every run.

```json
[
  { "slug": "kapiva-home", "url": "https://kapiva.com" },
  {
    "slug": "amazon-shilajit",
    "url": "https://www.amazon.in/...",
    "waitFor": "networkidle",
    "viewport": { "width": 1440, "height": 900 }
  }
]
```

Per entry:

| Field | Default | Notes |
|---|---|---|
| `slug` | required | Path-safe identifier. **Don't rename later** — it's the storage key. |
| `url` | required | Full URL. |
| `viewport` | `1440 × 900` | Browser viewport. Full-page screenshot still scrolls past it. |
| `waitFor` | `networkidle` | One of Playwright's `waitUntil` values. Use `domcontentloaded` for SPAs that never go idle. |

## Local development

```bash
# Once
npm install
npx playwright install chromium
cd viewer && npm install && cd ..

# Capture (writes to ./screenshots and updates manifest.json)
npm run capture

# Run viewer against the local screenshots/manifest
cd viewer && npm run dev   # http://localhost:5173
```

The viewer's Vite config has a small dev-only middleware that serves
`/manifest.json` and `/screenshots/*` from the repo root so you don't need to
copy anything around during development.

## Push to GitHub

1. **Create the repo** (use the GitHub CLI or the web UI):
   ```bash
   gh repo create epoch --public --source=. --remote=origin --push
   ```

2. **Enable GitHub Pages**: repo Settings → Pages → Source: **GitHub Actions**.

3. **Allow workflows to write commits**: repo Settings → Actions → General →
   Workflow permissions → **Read and write permissions**. (`GITHUB_TOKEN` then
   has the `contents: write` it needs to push from the capture job.)

4. **First capture**: Actions tab → **capture** → **Run workflow**. After it
   finishes, a `capture: …` commit appears with the PNGs and updated manifest.

5. **First deploy**: that push triggers the `deploy-viewer` workflow. Visit
   `https://<your-username>.github.io/<repo-name>/`.

6. **Enable the cron**: the schedule in `.github/workflows/capture.yml` is
   active by default. To pause, comment out the `schedule:` block.

## Project layout

```
.
├── urls.json                       Tracked URLs — you edit this
├── manifest.json                   Generated index of captures
├── screenshots/{slug}/{ts}.png     Generated PNGs
├── scripts/
│   ├── capture.ts                  Playwright capture + manifest update
│   └── lib/manifest.ts             Read/merge/write manifest
├── .github/workflows/
│   ├── capture.yml                 3× daily cron + workflow_dispatch
│   └── deploy.yml                  Build & deploy viewer to Pages on push
└── viewer/                         Vite + React app
    ├── src/App.tsx                 List + detail routing
    ├── src/Compare.tsx             Side-by-side + Pixelmatch diff overlay
    └── vite.config.ts
```

## Storage scale

At 10 URLs × 3 captures/day × ~300 KB PNG:

- ~270 MB/month, ~3.3 GB/year
- GitHub recommends repos stay under 1 GB and hard-caps at 5 GB
- → comfortable for ~3-4 months, viable for ~12-14 months

When you cross 1 GB, migrate `screenshots/` to Cloudflare R2 (10 GB free,
zero egress). The plan file at `~/.claude/plans/i-want-to-create-woolly-deer.md`
documents the migration steps.

## Troubleshooting

**Playwright timeout** on a specific URL → try setting `"waitFor": "domcontentloaded"`
in `urls.json`. Some pages (Amazon, news sites) keep firing background requests
and never reach `networkidle`.

**Capture commit not pushed** → repo Settings → Actions → Workflow permissions
must be **Read and write**. The job rebases before push to handle concurrent
runs, but won't push if it can't write.

**Pages 404** → repo Settings → Pages → Source must be **GitHub Actions**
(not "Deploy from a branch"). The `vite.config.ts` uses `BASE_PATH` to scope
asset URLs to `/<repo-name>/` in the deploy workflow.

**Diff shows whole page as changed** → the two screenshots are different sizes.
Add a fixed `viewport` in `urls.json` and disable lazy-loaded content if needed.
Pixelmatch can only diff equal-dimension images.
