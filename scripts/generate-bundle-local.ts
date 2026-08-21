/**
 * Runs `generateDailyBundle` against the real Pixabay API and writes the result to
 * `public/dev-bundles/<dateKey>.json`, where `bundleSource.ts`'s `local` mode reads it from
 * (via Vite's static `public/` serving) at `/dev-bundles/<dateKey>.json`.
 *
 * Usage: `npm run bundle:generate [-- <dateKey>]` (dateKey defaults to today, UTC).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchPixabayVideos } from '../shared/pixabay'
import { generateDailyBundle, type FetchCandidates } from '../shared/pathGeneration'
import { todayUtcKey } from '../shared/dailyKey'

try {
  process.loadEnvFile()
} catch {
  // .env is optional if PIXABAY_API_KEY is already in the environment.
}

async function main() {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) {
    throw new Error('PIXABAY_API_KEY is not set (checked process.env and .env)')
  }

  const dateKey = process.argv[2] ?? todayUtcKey()

  const fetchCandidates: FetchCandidates = (category, perPage) =>
    fetchPixabayVideos({ category, perPage, safesearch: true }, apiKey)

  console.log(`Generating daily bundle for ${dateKey}...`)
  const bundle = await generateDailyBundle({ dateKey, fetchCandidates })

  const outDir = path.resolve(import.meta.dirname, '../public/dev-bundles')
  await mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `${dateKey}.json`)
  await writeFile(outPath, JSON.stringify(bundle, null, 2))

  console.log(`Wrote ${outPath}`)
  console.log(`Goal: category=${bundle.goal.category} tags=${bundle.goal.tags.join(', ')}`)
  console.log(`Path chain: ${bundle.pathChain.map((p) => p.category).join(' -> ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
