# Portfolio

Migration of Fabrice Bokovi's portfolio from **Webflow** to **Astro + Sanity**.

- `site/` — Astro 7 static site (the public site)
- `studio/` — Sanity Studio v6 (content editing)
- `migration-assets/` — project images pulled out of Webflow, used to seed Sanity

The old Webflow site is still live at <https://www.fabricebokovi.com> and is the
visual source of truth until DNS is cut over.

## Where things stand

The migration itself is **done and on `master`**. All six routes build and render
real content from Sanity:

```
/                          split "choose your path" landing
/old-home                  main portfolio (works, about, process)
/photography-gallery       coming-soon placeholder
/selected-works/[slug]     3 pages, generated from Sanity
```

Sanity is **seeded** — 3 works, 6 categories, 21 images.

**Next step: hosting.** `netlify.toml` is committed and a clean-clone
`npm ci && npm run build` was verified to produce all 6 pages. What remains is
manual, in a browser:

1. Connect `febreze101/Portfolio` to Netlify (Add new site → Import → GitHub).
   Do **not** override build settings — `netlify.toml` supplies all of them.
2. Verify on the `*.netlify.app` preview URL (see "What to check" below).
3. Only then cut `fabricebokovi.com` over from Webflow. That is a **registrar /
   nameserver** change, not just a Netlify one.

### What to check on the preview

These were rebuilt rather than copied, so they carry the most risk:

- `/` intro sequence — quote chars rise in → spinner → quote drops → loader
  lifts → landing scales up → prompt text fades in word by word.
- `/` hover — left/right columns swap heading for description + button.
- `/old-home` — the process accordion opens/closes; 3 work cards show images.
- Fonts — GreatLakesNF, Antique Olive, aktiv-grotesk. A fallback font
  rendering anywhere is a real bug.

## Commands

```bash
# Site
cd site && npm run dev          # or: astro dev --background
cd site && npm run build

# Studio (local only — never deployed; sanity.io/manage shows no Studio URL,
# which is expected until someone runs `sanity deploy`)
cd studio && npm run dev

# Re-seed Sanity (idempotent — deterministic ids + createOrReplace)
cd studio && npx sanity exec scripts/seed.mjs --with-user-token
cd studio && node scripts/seed.mjs --dry     # preview without writing
```

## Things that will bite you

- **`site/.env` is gitignored** and won't exist on a fresh clone. The site needs
  `PUBLIC_SANITY_PROJECT_ID=hvkunqtv` and `PUBLIC_SANITY_DATASET=production`.
  Neither is a secret — the project id is in `studio/sanity.config.ts` and the
  dataset is public-read — so they're also set in `netlify.toml`. Recreate
  `site/.env` locally with those two lines.

- **`useCdn` must stay `false`** in `site/src/lib/sanityClient.ts`. Every query
  runs at build time and Sanity's CDN caches *per query*, so building through it
  can bake stale content into the output. This already happened once: right
  after seeding, `count()` returned 3 while the projection query still served an
  empty cached result, and the build silently produced zero work pages.

- **Webflow interactions are not in the published HTML.** They're compiled into
  Webflow's JS chunk as IX3 JSON. The intro timeline (`t-760b4be5`) and the
  process accordion were extracted from there and rebuilt in GSAP. If more
  Webflow pages get ported, expect to dig into `webflow.<hash>.js` again rather
  than the page source. Webflow easing indices map to GSAP names by position:
  `7` → `power3.in`, `25` → `expo.in`, `27` → `expo.inOut`.

- **`site/src/styles/webflow.css` is Webflow's generated bundle, copied
  verbatim** apart from font/image URLs rewritten to local paths. Don't
  hand-edit it expecting it to survive; new styling should go elsewhere.

- Fonts and the two landing background images are **self-hosted** in
  `site/public/`. Nothing depends on Webflow's CDN anymore — keep it that way.

## Reference IDs

- Sanity project `hvkunqtv`, dataset `production` (public read, so GROQ can be
  curl'd with no token)
- Webflow site `68f152acc5f37034a1f8df26`; collections Selected Works
  `68fa93d1ad65421b345bef3f`, Categories `68fa9626b601eb5a70ecc24c`

## Working agreement

The migration was deliberately a **copy-as-is** port — fidelity to the Webflow
design over clean-slate rewriting. That phase is over. Redesign work should go
on **feature branches** off `master`.

## Known gaps

- Webflow's lightbox on work-detail galleries wasn't ported; images open in a
  new tab.
- `/categories/<slug>` was skipped — the Webflow template renders an empty body.
  `getWorksByCategory()` in `site/src/lib/queries.ts` is unused, waiting on it.
- The landing background images are 2048px at WebP q82. Dropping to q75, or
  downscaling to ~1600px, would roughly halve them again.
