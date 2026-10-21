import { acquireElectronDebugger, type ElectronDebuggerLease } from './electron-debugger-lease'
import { getBrowserSiteDisplay, updateBrowserSiteDisplay } from './browser-site-display-store'
import {
  browserSiteDisplayKey,
  type BrowserPageSiteDisplay,
  type BrowserSiteColorScheme
} from '../../shared/browser-site-display'
import {
  DEFAULT_BROWSER_PAGE_ZOOM_LEVEL,
  nextBrowserPageZoomLevel,
  normalizeBrowserPageZoomLevel,
  type BrowserPageZoomDirection
} from '../../shared/browser-page-zoom'
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'

type TrackedGuest = {
  guest: Electron.WebContents
  profileId: string
  stopWatchingDomReady: () => void
  colorScheme: {
    lease: ElectronDebuggerLease
    stopWatchingDetach: () => void
    /** Orca's scheme is in force on the page, so leaving the site must clear it. */
    standing: boolean
  } | null
}

const ZOOM_EPSILON = 1e-6

/**
 * Shows each page the way its browser profile remembers the site: its own zoom (or Default Zoom)
 * and its own color scheme (or Orca's theme). Only webview guests take part; streamed pages have
 * no menu to change either.
 */
export class BrowserSiteDisplayController {
  private readonly guests = new Map<number, TrackedGuest>()
  private getDefaultZoomLevel = (): number => DEFAULT_BROWSER_PAGE_ZOOM_LEVEL

  /** Electron pushes Orca's UI zoom onto every webview, so a UI zoom change moves pages too. */
  followZoomSettings(ui: {
    getUI: () => PersistedUIState
    onUIChanged: (listener: (ui: PersistedUIState) => void) => () => void
  }): void {
    let { uiZoomLevel, browserDefaultZoomLevel } = ui.getUI()
    this.getDefaultZoomLevel = () =>
      normalizeBrowserPageZoomLevel(ui.getUI().browserDefaultZoomLevel)
    ui.onUIChanged((next) => {
      if (
        next.uiZoomLevel === uiZoomLevel &&
        next.browserDefaultZoomLevel === browserDefaultZoomLevel
      ) {
        return
      }
      ;({ uiZoomLevel, browserDefaultZoomLevel } = next)
      this.reapplyZoom()
    })
  }

  /** `navigationUrl` is the page being loaded, which can be ahead of the committed URL. */
  onGuestRegistered(
    guest: Electron.WebContents,
    profileId: string | null,
    navigationUrl: string
  ): void {
    const previous = this.guests.get(guest.id)
    previous?.stopWatchingDomReady()
    // Why dom-ready: once Orca's UI zoom has changed, Electron copies it onto the guest at some
    // point after each commit; dom-ready always comes after that copy.
    const onDomReady = (): void => this.applyZoom(guest.id)
    guest.on('dom-ready', onDomReady)
    this.guests.set(guest.id, {
      guest,
      profileId: profileId ?? 'default',
      stopWatchingDomReady: () => guest.off('dom-ready', onDomReady),
      colorScheme: previous?.colorScheme ?? null
    })
    this.applyColorScheme(guest.id, navigationUrl)
    this.applyZoom(guest.id)
  }

  onGuestRetired(guestId: number): void {
    this.releaseColorScheme(guestId)
    const tracked = this.guests.get(guestId)
    if (tracked && !tracked.guest.isDestroyed()) {
      tracked.stopWatchingDomReady()
    }
    this.guests.delete(guestId)
  }

  /** Called before the new document exists, so its first paint already has the right scheme. */
  onMainFrameNavigationStarted(guestId: number, url: string): void {
    this.applyColorScheme(guestId, url)
  }

  /** Zoom is keyed by the committed host, so it can only be set once the navigation commits. */
  onMainFrameNavigationCommitted(guestId: number): void {
    const tracked = this.guests.get(guestId)
    if (tracked) {
      // Why the scheme again: a restored tab's first load starts before its guest registers.
      this.applyColorScheme(guestId, tracked.guest.getURL())
    }
    this.applyZoom(guestId)
  }

  private reapplyZoom(): void {
    for (const guestId of this.guests.keys()) {
      this.applyZoom(guestId)
    }
  }

  getPageDisplay(guestId: number): BrowserPageSiteDisplay | null {
    const tracked = this.guests.get(guestId)
    if (!tracked) {
      return null
    }
    const site = browserSiteDisplayKey(tracked.guest.getURL())
    const saved = site ? getBrowserSiteDisplay(tracked.profileId, site) : {}
    return {
      site,
      zoomLevel: saved.zoomLevel ?? this.getDefaultZoomLevel(),
      siteHasZoom: saved.zoomLevel !== undefined,
      colorScheme: saved.colorScheme ?? null
    }
  }

  zoomPage(guestId: number, direction: BrowserPageZoomDirection): BrowserPageSiteDisplay | null {
    const display = this.getPageDisplay(guestId)
    const tracked = this.guests.get(guestId)
    if (!display || !tracked || !display.site) {
      return display
    }
    const defaultLevel = this.getDefaultZoomLevel()
    // Why from the saved level: Electron pushes Orca's UI zoom onto every webview, so the live
    // level can be stale and stepping from it would save the wrong zoom.
    const next = nextBrowserPageZoomLevel(display.zoomLevel, direction, defaultLevel)
    updateBrowserSiteDisplay(tracked.profileId, display.site, {
      zoomLevel: Math.abs(next - defaultLevel) < ZOOM_EPSILON ? undefined : next
    })
    this.applyToSite(tracked.profileId, display.site)
    return this.getPageDisplay(guestId)
  }

  setColorScheme(
    guestId: number,
    colorScheme: BrowserSiteColorScheme | null
  ): BrowserPageSiteDisplay | null {
    const display = this.getPageDisplay(guestId)
    const tracked = this.guests.get(guestId)
    if (!display || !tracked || !display.site) {
      return display
    }
    updateBrowserSiteDisplay(tracked.profileId, display.site, {
      colorScheme: colorScheme ?? undefined
    })
    this.applyToSite(tracked.profileId, display.site)
    return this.getPageDisplay(guestId)
  }

  private applyToSite(profileId: string, site: string): void {
    for (const [guestId, tracked] of this.guests) {
      const url = tracked.guest.getURL()
      if (tracked.profileId === profileId && browserSiteDisplayKey(url) === site) {
        this.applyColorScheme(guestId, url)
        this.applyZoom(guestId)
      }
    }
  }

  private applyZoom(guestId: number): void {
    const tracked = this.guests.get(guestId)
    if (!tracked || tracked.guest.isDestroyed()) {
      return
    }
    const site = browserSiteDisplayKey(tracked.guest.getURL())
    const level = normalizeBrowserPageZoomLevel(
      (site ? getBrowserSiteDisplay(tracked.profileId, site).zoomLevel : undefined) ??
        this.getDefaultZoomLevel()
    )
    // Why compare first: Chromium keeps zoom per host, so a no-op write would still reset a
    // same-host tab that a different profile or the UI zoom push moved.
    if (Math.abs(tracked.guest.getZoomLevel() - level) > ZOOM_EPSILON) {
      tracked.guest.setZoomLevel(level)
    }
  }

  private applyColorScheme(guestId: number, url: string): void {
    const tracked = this.guests.get(guestId)
    if (!tracked || tracked.guest.isDestroyed()) {
      return
    }
    const site = browserSiteDisplayKey(url)
    const colorScheme = site
      ? getBrowserSiteDisplay(tracked.profileId, site).colorScheme
      : undefined
    if (!colorScheme && !tracked.colorScheme?.standing) {
      return
    }
    const state = tracked.colorScheme ?? this.acquireColorScheme(tracked)
    if (!state) {
      return
    }
    state.standing = colorScheme !== undefined
    // Why resend on every navigation: setEmulatedMedia replaces every emulated feature, so an
    // agent's `set media` call silently drops the scheme and only a fresh write restores it.
    tracked.guest.debugger
      .sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: colorScheme ?? '' }]
      })
      .catch((error: unknown) => {
        console.warn('[browser-site-display] failed to set the page color scheme', {
          guestWebContentsId: guestId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
  }

  // Why a lease held for the guest's life: an agent's lease that attached first would otherwise
  // detach on release and take the scheme with it.
  private acquireColorScheme(tracked: TrackedGuest): TrackedGuest['colorScheme'] {
    const { guest } = tracked
    let lease: ElectronDebuggerLease
    try {
      lease = acquireElectronDebugger(guest)
    } catch (error) {
      // Why: attach fails while DevTools holds the page; the next navigation tries again.
      console.warn('[browser-site-display] could not attach to set the page color scheme', {
        guestWebContentsId: guest.id,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
    // Why: opening DevTools detaches us and clears the scheme; drop the lease so the next
    // navigation attaches again.
    const onDetach = (): void => this.releaseColorScheme(guest.id)
    guest.debugger.on('detach', onDetach)
    tracked.colorScheme = {
      lease,
      stopWatchingDetach: () => guest.debugger.off('detach', onDetach),
      standing: false
    }
    return tracked.colorScheme
  }

  private releaseColorScheme(guestId: number): void {
    const tracked = this.guests.get(guestId)
    const state = tracked?.colorScheme
    if (!tracked || !state) {
      return
    }
    tracked.colorScheme = null
    try {
      state.stopWatchingDetach()
      state.lease.release()
    } catch {
      // Why: best-effort — the guest may already be destroyed.
    }
  }
}

export const browserSiteDisplayController = new BrowserSiteDisplayController()
