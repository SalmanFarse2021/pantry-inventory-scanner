export function LoseOverlay({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 text-center text-white">
      <h2 className="text-4xl font-bold">brainrot depleted</h2>
      <p className="opacity-80">the algorithm lost the thread. try again.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={onRetry}>
        retry
      </button>
    </div>
  )
}
