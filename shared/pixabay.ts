import type { PixabayCategory } from './categories.js'
import type { Post } from './types.js'

const PIXABAY_VIDEO_SEARCH_URL = 'https://pixabay.com/api/videos/'

interface PixabayVideoRendition {
  url: string
  width: number
  height: number
  size: number
  thumbnail: string
}

export interface PixabayVideoHit {
  id: number
  pageURL: string
  type: string
  tags: string
  duration: number
  videos: {
    large: PixabayVideoRendition
    medium: PixabayVideoRendition
    small: PixabayVideoRendition
    tiny: PixabayVideoRendition
  }
  user_id: number
  user: string
}

export interface PixabayVideoResponse {
  total: number
  totalHits: number
  hits: PixabayVideoHit[]
}

export function splitTags(rawTags: string): string[] {
  return rawTags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

export function isValidVideoHit(hit: PixabayVideoHit): boolean {
  return (
    splitTags(hit.tags).length > 0 &&
    !!hit.videos.medium?.url &&
    !!hit.videos.small?.url
  )
}

export interface PixabaySearchParams {
  category?: PixabayCategory
  q?: string
  perPage?: number
  page?: number
  safesearch?: boolean
}

/** Server-only: calls Pixabay's video search directly. Never call this from client code. */
export async function fetchPixabayVideos(
  params: PixabaySearchParams,
  apiKey: string,
): Promise<PixabayVideoHit[]> {
  const url = new URL(PIXABAY_VIDEO_SEARCH_URL)
  url.searchParams.set('key', apiKey)
  if (params.category) url.searchParams.set('category', params.category)
  if (params.q) url.searchParams.set('q', params.q)
  url.searchParams.set('per_page', String(params.perPage ?? 20))
  url.searchParams.set('safesearch', String(params.safesearch ?? true))
  if (params.page) url.searchParams.set('page', String(params.page))

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Pixabay video search failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as PixabayVideoResponse
  return data.hits
}

export function normalizePixabayVideo(
  hit: PixabayVideoHit,
  category: PixabayCategory,
): Post {
  return {
    id: hit.id,
    category,
    tags: splitTags(hit.tags),
    rawTags: hit.tags,
    duration: hit.duration,
    video: {
      medium: {
        url: hit.videos.medium.url,
        width: hit.videos.medium.width,
        height: hit.videos.medium.height,
        thumbnail: hit.videos.medium.thumbnail,
      },
      small: {
        url: hit.videos.small.url,
        width: hit.videos.small.width,
        height: hit.videos.small.height,
        thumbnail: hit.videos.small.thumbnail,
      },
    },
    attribution: {
      user: hit.user,
      userId: hit.user_id,
      pageURL: hit.pageURL,
    },
  }
}
