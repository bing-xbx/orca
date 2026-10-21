import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

// Why a delay: loads that finish sooner (most local dev servers) should show nothing at all.
const SHOW_DELAY_MS = 200
// Why so long: the line holds at 90% for a slow page, then gives up on one that never stops.
const TRICKLE_MS = 10 * 60_000
const TRICKLE_ID = 'browser-load-trickle'
const STILL_ID = 'browser-load-still'

// Electron reports no load percentage, so the line eases toward 90% and the real stop finishes it.
const TRICKLE_STEPS: [atMs: number, scale: number][] = [
  [0, 0],
  [300, 0.15],
  [2_000, 0.45],
  [6_000, 0.7],
  [15_000, 0.85],
  [30_000, 0.9],
  [TRICKLE_MS, 0.9]
]
const TRICKLE_KEYFRAMES: Keyframe[] = TRICKLE_STEPS.map(([atMs, scale]) => ({
  offset: atMs / TRICKLE_MS,
  transform: `scaleX(${scale})`,
  opacity: atMs === 0 ? 0 : 1,
  easing: 'ease-out'
}))
// Reduced motion: a still, dimmed full-width line that still reads as "working".
const STILL_KEYFRAMES: Keyframe[] = [
  { offset: 0, transform: 'scaleX(1)', opacity: 0 },
  { offset: 150 / TRICKLE_MS, transform: 'scaleX(1)', opacity: 0.5 },
  { offset: 1, transform: 'scaleX(1)', opacity: 0.5 }
]

/** A thin line along the bottom edge of the address bar while the page loads. */
export function BrowserLoadProgress({
  loading,
  failed
}: {
  loading: boolean
  failed: boolean
}): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const bar = barRef.current
    if (!bar) {
      return
    }
    // Why finish() and never cancel(): with no fill an ended animation leaves the bar at its
    // hidden base style, and finish() resolves rather than rejecting `finished`.
    const animations = bar.getAnimations()
    const running = animations.find(({ id }) => id === TRICKLE_ID || id === STILL_ID)
    if (loading) {
      const id = reducedMotion ? STILL_ID : TRICKLE_ID
      // Why: a navigation that replaces one in flight keeps loading true, so the line carries on.
      if (running?.id === id) {
        return
      }
      animations.forEach((animation) => animation.finish())
      bar.animate(reducedMotion ? STILL_KEYFRAMES : TRICKLE_KEYFRAMES, {
        id,
        duration: TRICKLE_MS,
        // A motion-preference switch mid-load swaps the animation without hiding it again.
        delay: running ? 0 : SHOW_DELAY_MS
      })
      return
    }
    if (!running) {
      return
    }
    const { transform, opacity } = getComputedStyle(bar)
    running.finish()
    // Still inside the show delay: the load was fast enough to show nothing.
    if (Number(opacity) === 0) {
      return
    }
    // Why: a failed load fades where it stopped instead of filling up like a success.
    const end = failed || reducedMotion ? transform : 'scaleX(1)'
    bar.animate(
      [
        { transform, opacity },
        { transform: end, opacity, offset: 0.4 },
        { transform: end, opacity: 0 }
      ],
      { duration: 450, easing: 'ease-out' }
    )
  }, [failed, loading, reducedMotion])

  return (
    // Why -inset-px: the line sits on the bar's bottom border instead of a pixel above it.
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-px overflow-hidden rounded-[inherit]"
    >
      <div
        ref={barRef}
        data-browser-load-progress={loading ? 'loading' : 'idle'}
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-callout-note opacity-0"
      />
    </div>
  )
}
