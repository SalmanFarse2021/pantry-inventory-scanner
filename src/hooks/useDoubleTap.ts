import { useRef } from 'react'

const DOUBLE_TAP_WINDOW_MS = 300

/** Returns an onPointerUp handler that calls `onDoubleTap` when two taps land within 300ms. */
export function useDoubleTap(onDoubleTap: () => void) {
  const lastTapRef = useRef(0)

  return () => {
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_WINDOW_MS) {
      lastTapRef.current = 0
      onDoubleTap()
    } else {
      lastTapRef.current = now
    }
  }
}
