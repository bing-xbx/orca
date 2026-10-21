export type BrowserPageZoomDirection = 'in' | 'out' | 'reset'

export type BrowserPageZoomCommand = {
  browserPageId: string
  direction: BrowserPageZoomDirection
}

export const DEFAULT_BROWSER_PAGE_ZOOM_LEVEL = 0

// Why: Chrome's page zoom presets; Electron levels are log base 1.2 of the zoom factor.
const BROWSER_PAGE_ZOOM_PERCENTS = [
  25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500
] as const

export const BROWSER_PAGE_ZOOM_LEVELS: readonly number[] = BROWSER_PAGE_ZOOM_PERCENTS.map(
  (percent) => (percent === 100 ? 0 : Math.log(percent / 100) / Math.log(1.2))
)

function nearestZoomLevelIndex(level: number): number {
  let nearest = 0
  for (let index = 1; index < BROWSER_PAGE_ZOOM_LEVELS.length; index++) {
    if (
      Math.abs(BROWSER_PAGE_ZOOM_LEVELS[index] - level) <
      Math.abs(BROWSER_PAGE_ZOOM_LEVELS[nearest] - level)
    ) {
      nearest = index
    }
  }
  return nearest
}

/** Snaps any level, including ones saved before the presets, to the nearest preset. */
export function normalizeBrowserPageZoomLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_BROWSER_PAGE_ZOOM_LEVEL
  }
  return BROWSER_PAGE_ZOOM_LEVELS[nearestZoomLevelIndex(value)]
}

export function browserPageZoomLevelToPercent(level: number): number {
  return BROWSER_PAGE_ZOOM_PERCENTS[nearestZoomLevelIndex(normalizeBrowserPageZoomLevel(level))]
}

export function nextBrowserPageZoomLevel(
  current: number,
  direction: BrowserPageZoomDirection,
  resetLevel: number = DEFAULT_BROWSER_PAGE_ZOOM_LEVEL
): number {
  if (direction === 'reset') {
    return normalizeBrowserPageZoomLevel(resetLevel)
  }
  const index = nearestZoomLevelIndex(normalizeBrowserPageZoomLevel(current))
  const next = direction === 'in' ? index + 1 : index - 1
  return BROWSER_PAGE_ZOOM_LEVELS[Math.max(0, Math.min(BROWSER_PAGE_ZOOM_LEVELS.length - 1, next))]
}
