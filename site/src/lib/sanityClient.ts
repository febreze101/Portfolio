import { createClient } from '@sanity/client'
import {createImageUrlBuilder} from '@sanity/image-url'
import type {SanityImageSource} from '@sanity/image-url'

export const client = createClient({
    projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID,
    dataset: import.meta.env.PUBLIC_SANITY_DATASET,
    apiVersion: '2026-09-04',
    // These queries only run at build time. The CDN caches per-query, so
    // building through it can bake a stale result into the output — which is
    // exactly what happened right after the dataset was first seeded.
    useCdn: false,
})

const builder = createImageUrlBuilder(client)
export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}

