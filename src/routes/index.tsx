import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchDailyBundle } from '../lib/bundleSource'
import { useGameStore } from '../game/gameStore'

export const Route = createFileRoute('/')({
  component: SplashScreen,
})

function SplashScreen() {
  const navigate = useNavigate()
  const bundle = useGameStore((s) => s.bundle)
  const loadBundle = useGameStore((s) => s.loadBundle)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['daily-bundle'],
    queryFn: fetchDailyBundle,
  })

  useEffect(() => {
    if (data) loadBundle(data)
  }, [data, loadBundle])

  useEffect(() => {
    if (bundle) void navigate({ to: '/goal' })
  }, [bundle, navigate])

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-2 bg-base-100 text-base-content">
      <span className="font-museo text-[108px] font-extrabold leading-none">b</span>
      <span className="font-mulish -mt-4 text-5xl font-extrabold italic">BrainRot</span>
      {isLoading && <p className="mt-4 opacity-70">loading today&apos;s challenge…</p>}
      {isError && <p className="mt-4 text-error">failed to load: {String(error)}</p>}
    </div>
  )
}
