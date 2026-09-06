/**
 * Seeds the Sanity dataset with the content migrated from Webflow.
 *
 * Images come from `migration-assets/<slug>/` in the repo root, so the seeded
 * dataset has no dependency on Webflow's CDN.
 *
 * Usage — either of:
 *   npx sanity exec scripts/seed.mjs --with-user-token   (uses your CLI login)
 *   SANITY_WRITE_TOKEN=sk... node scripts/seed.mjs       (explicit token)
 *
 * The script is idempotent — it uses deterministic document ids and
 * `createOrReplace`, so re-running it overwrites rather than duplicates.
 * Pass `--dry` to preview without writing.
 */

import {createClient} from '@sanity/client'
import {createReadStream, existsSync} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_ROOT = resolve(__dirname, '../../migration-assets')

const DRY_RUN = process.argv.includes('--dry')
const API_VERSION = '2026-09-04'

async function resolveClient() {
  if (DRY_RUN) return null

  const token = process.env.SANITY_WRITE_TOKEN
  if (token) {
    return createClient({
      projectId: 'hvkunqtv',
      dataset: 'production',
      apiVersion: API_VERSION,
      token,
      useCdn: false,
    })
  }

  // Running under `sanity exec --with-user-token`: the CLI hands us an
  // already-authenticated client, so no token needs to be handled here.
  try {
    const {getCliClient} = await import('sanity/cli')
    return getCliClient({apiVersion: API_VERSION, useCdn: false})
  } catch {
    console.error(
      'No credentials available.\n\n' +
        'Either run through the Sanity CLI (uses your existing login):\n' +
        '  npx sanity exec scripts/seed.mjs --with-user-token\n\n' +
        'or supply a token with Editor access from sanity.io/manage\n' +
        '(project hvkunqtv → API → Tokens):\n' +
        '  SANITY_WRITE_TOKEN=sk... node scripts/seed.mjs\n',
    )
    process.exit(1)
  }
}

const client = await resolveClient()

const categories = [
  {name: 'Brand Identity', slug: 'brand-identity'},
  {name: 'Figma', slug: 'figma'},
  {name: 'Webflow', slug: 'webflow'},
  {name: 'Hospitality', slug: 'hospitality'},
  {name: 'Spec Site', slug: 'spec-site'},
  {name: 'Website', slug: 'website'},
]

const works = [
  {
    name: 'Palermo Rose Garden',
    slug: 'palermo-rose-garden',
    summary: 'High End Destination Resort',
    fullDescription:
      'The objective was to create an elegant landing page that showcased a unique getaway in a fictitious location. The website serves as a digital gateway for potential guests to explore the location, learn about its offerings, and make direct bookings. The focus is on providing a personalized, immersive experience that reflects the charm and exclusivity of the getaway.',
    link: 'https://www.figma.com/design/jlukxAwXjOW37wNnYgfPH3/Palermo-Garden-Slides?node-id=0-1&t=SH56iJbVznBvQatH-1',
    categories: ['figma', 'spec-site', 'hospitality'],
  },
  {
    name: "Barb's Breakfast Bar",
    slug: 'barbs-breakfast-bar',
    summary: 'Eccentric Mobile Breakfast Bar',
    fullDescription:
      'The objective was to create a five-page website for a local mobile breakfast business. They wanted a site that embodied their surrealist, out-of-this-world vibe—something whimsical, unexpected, and memorable. The final design is full of interactive elements, bold visuals, and layered textures that reflect the brand’s playful personality. From animated call-to-actions to immersive flavor journeys, every page is designed to draw users in and make the experience feel more like an adventure than a menu browse. The site aims to capture the soul of the business: vibrant, imaginative, and deeply rooted in community and creativity.',
    link: 'https://www.barbsbreakfastbar.com/',
    categories: ['webflow', 'figma', 'website'],
  },
  {
    name: 'The Daily Grind',
    slug: 'the-daily-grind',
    summary: 'High End Coffee Roastery Site',
    fullDescription:
      'The core design challenge was to create a visual identity and e-commerce experience that bridged the precise science of roasting with the welcoming warmth of the cafe. This was achieved by developing a sophisticated, minimalist aesthetic utilizing a rich palette of Charcoal Greys, Warm Creams, and Deep Browns. The website\'s editorial layout, powered by CSS Grid, highlights high-quality product photography while seamlessly prioritizing content hierarchy. Typography blends a classic serif for sophisticated headers with a clean sans-serif for readability, reinforcing the "craft" focus. By ensuring a mobile-first approach and dedicating space to ethical sourcing stories, the design delivers an engaging, authentic, and functional platform for both national e-commerce growth and local community engagement.',
    link: 'https://the-daily-grind-c9885a.webflow.io/',
    categories: ['figma', 'webflow', 'spec-site', 'website'],
  },
]

const categoryId = (slug) => `category-${slug}`
const workId = (slug) => `selectedWork-${slug}`

let keyCounter = 0
const nextKey = () => `k${(keyCounter++).toString(36)}${Date.now().toString(36)}`

/** Wraps a plain string in a single Portable Text block. */
function toPortableText(text) {
  return [
    {
      _type: 'block',
      _key: nextKey(),
      style: 'normal',
      markDefs: [],
      children: [{_type: 'span', _key: nextKey(), text, marks: []}],
    },
  ]
}

async function uploadImage(path) {
  const filename = basename(path)
  if (!existsSync(path)) {
    console.warn(`  ! missing ${filename}, skipping`)
    return null
  }

  if (DRY_RUN) {
    console.log(`  · would upload ${filename}`)
    return null
  }

  const asset = await client.assets.upload('image', createReadStream(path), {filename})
  console.log(`  · uploaded ${filename} -> ${asset._id}`)
  return {_type: 'image', asset: {_type: 'reference', _ref: asset._id}}
}

async function main() {
  console.log(DRY_RUN ? 'Dry run — no writes will be made.\n' : 'Seeding Sanity...\n')

  console.log('Categories')
  const categoryDocs = categories.map((category) => ({
    _id: categoryId(category.slug),
    _type: 'category',
    name: category.name,
    slug: {_type: 'slug', current: category.slug},
  }))

  if (!DRY_RUN) {
    const tx = client.transaction()
    categoryDocs.forEach((doc) => tx.createOrReplace(doc))
    await tx.commit()
  }
  categoryDocs.forEach((doc) => console.log(`  · ${doc.name}`))

  console.log('\nSelected works')
  for (const work of works) {
    console.log(`\n${work.name}`)
    const assetDir = join(ASSETS_ROOT, work.slug)

    const heroImage = await uploadImage(join(assetDir, 'hero.png'))
    const thumbnail = await uploadImage(join(assetDir, 'thumbnail.png'))

    const gallery = []
    for (const n of [1, 2, 3]) {
      const image = await uploadImage(join(assetDir, `gallery-${n}.png`))
      if (image) gallery.push({...image, _key: nextKey()})
    }

    const doc = {
      _id: workId(work.slug),
      _type: 'selectedWorks',
      name: work.name,
      slug: {_type: 'slug', current: work.slug},
      summary: work.summary,
      fullDescription: toPortableText(work.fullDescription),
      link: work.link,
      ...(heroImage ? {heroImage} : {}),
      ...(thumbnail ? {thumbnail} : {}),
      ...(gallery.length ? {images: gallery} : {}),
      categories: work.categories.map((slug) => ({
        _type: 'reference',
        _ref: categoryId(slug),
        _key: nextKey(),
      })),
    }

    if (!DRY_RUN) {
      await client.createOrReplace(doc)
    }
    console.log(`  · ${DRY_RUN ? 'would write' : 'wrote'} ${doc._id}`)
  }

  console.log('\nDone.')
}

main().catch((error) => {
  console.error('\nSeed failed:', error.message)
  process.exit(1)
})
