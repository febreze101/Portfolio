import type {PortableTextBlock} from '@portabletext/types'
import type {SanityImageSource} from '@sanity/image-url'
import {client} from './sanityClient'

export interface Category {
  _id: string
  name: string
  slug: string
}

export interface SelectedWork {
  _id: string
  name: string
  slug: string
  summary: string | null
  fullDescription: PortableTextBlock[] | null
  link: string | null
  thumbnail: SanityImageSource | null
  heroImage: SanityImageSource | null
  images: SanityImageSource[] | null
  categories: Category[]
}

const workProjection = `
  _id,
  name,
  "slug": slug.current,
  summary,
  fullDescription,
  link,
  thumbnail,
  heroImage,
  images,
  "categories": categories[]->{_id, name, "slug": slug.current}
`

export function getSelectedWorks(): Promise<SelectedWork[]> {
  return client.fetch(
    `*[_type == "selectedWorks" && defined(slug.current)]
      | order(name asc){${workProjection}}`,
  )
}

export function getSelectedWork(slug: string): Promise<SelectedWork | null> {
  return client.fetch(
    `*[_type == "selectedWorks" && slug.current == $slug][0]{${workProjection}}`,
    {slug},
  )
}

export function getCategories(): Promise<Category[]> {
  return client.fetch(
    `*[_type == "category" && defined(slug.current)]
      | order(name asc){_id, name, "slug": slug.current}`,
  )
}

export function getWorksByCategory(slug: string): Promise<SelectedWork[]> {
  return client.fetch(
    `*[_type == "selectedWorks" && $slug in categories[]->slug.current]
      | order(name asc){${workProjection}}`,
    {slug},
  )
}
