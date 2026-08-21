import { mockFillerBatch } from './mockBundle'
import { fetchWeightedFillerBatch } from './pixabayFiller'
import type { FillerFetcher } from '../components/feed/FeedList'

/**
 * 'mock' (default) needs no server and works under plain `vite dev`.
 * 'live' calls the real weighted Pixabay proxy — requires `/api/feed/batch` to be served
 * (i.e. `vercel dev`, or a deployment) and `PIXABAY_API_KEY` configured server-side.
 */
export function resolveFillerFetcher(): FillerFetcher {
  return import.meta.env.VITE_FILLER_SOURCE === 'live'
    ? fetchWeightedFillerBatch
    : (_weights, n) => mockFillerBatch(n)
}
