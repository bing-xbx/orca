import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import {
  browserPageZoomLevelToPercent,
  normalizeBrowserPageZoomLevel
} from '../../shared/browser-page-zoom'
import { BrowserSiteDisplayController } from './browser-site-display-controller'
import { configureBrowserSiteDisplayStore } from './browser-site-display-store'

type FakeGuest = Electron.WebContents &
  EventEmitter & { url: string; level: number; mediaSent: unknown[] }

let nextGuestId = 1

function fakeGuest(url: string): FakeGuest {
  const debuggerEvents = new EventEmitter()
  let attached = false
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the controller only reads id, getURL, zoom, isDestroyed, dom-ready and the debugger.
  const guest = new EventEmitter() as FakeGuest
  Object.assign(guest, {
    id: nextGuestId++,
    url,
    level: 0,
    mediaSent: [],
    isDestroyed: () => false,
    getURL: () => guest.url,
    getZoomLevel: () => guest.level,
    setZoomLevel: (level: number) => {
      guest.level = level
    },
    debugger: Object.assign(debuggerEvents, {
      isAttached: () => attached,
      attach: () => {
        attached = true
      },
      detach: () => {
        attached = false
        debuggerEvents.emit('detach')
      },
      sendCommand: (method: string, params: { features: { value: string }[] }) => {
        if (method === 'Emulation.setEmulatedMedia') {
          guest.mediaSent.push(params.features[0].value)
        }
        return Promise.resolve({})
      }
    })
  })
  return guest
}

/** What the page shows after the navigation commits and its document loads. */
function commit(controller: BrowserSiteDisplayController, guest: FakeGuest, url: string): void {
  controller.onMainFrameNavigationStarted(guest.id, url)
  guest.url = url
  controller.onMainFrameDocumentSettled(guest.id)
  guest.emit('dom-ready')
}

function uiStore(initial: Partial<PersistedUIState> = {}): {
  getUI: () => PersistedUIState
  onUIChanged: (listener: (ui: PersistedUIState) => void) => () => void
  update: (update: Partial<PersistedUIState>) => void
} {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the controller reads only uiZoomLevel and browserDefaultZoomLevel.
  let ui = { uiZoomLevel: 0, browserDefaultZoomLevel: 0, ...initial } as PersistedUIState
  const listeners: ((ui: PersistedUIState) => void)[] = []
  return {
    getUI: () => ui,
    onUIChanged: (listener) => {
      listeners.push(listener)
      return () => {}
    },
    update: (update) => {
      ui = { ...ui, ...update }
      listeners.forEach((listener) => listener(ui))
    }
  }
}

const percent = (guest: FakeGuest): number => browserPageZoomLevelToPercent(guest.level)

beforeEach(() => {
  configureBrowserSiteDisplayStore(mkdtempSync(join(tmpdir(), 'orca-site-display-')))
})

describe('BrowserSiteDisplayController zoom', () => {
  it('keeps zoom per site and browser profile, and resets it to Default Zoom', () => {
    const controller = new BrowserSiteDisplayController()
    const ui = uiStore({ browserDefaultZoomLevel: normalizeBrowserPageZoomLevel(0.5) })
    controller.followZoomSettings(ui)
    const github = fakeGuest('https://github.com/a')
    const githubOtherPort = fakeGuest('https://github.com:8443/b')
    const githubWork = fakeGuest('https://github.com/c')
    const docs = fakeGuest('https://docs.example.com/')
    controller.onGuestRegistered(github, null, github.url)
    controller.onGuestRegistered(githubOtherPort, 'default', githubOtherPort.url)
    controller.onGuestRegistered(githubWork, 'work', githubWork.url)
    controller.onGuestRegistered(docs, null, docs.url)

    controller.zoomPage(github.id, 'in')

    expect([github, githubOtherPort, githubWork, docs].map(percent)).toEqual([125, 125, 110, 110])
    commit(controller, docs, 'https://github.com/d')
    expect(percent(docs)).toBe(125)

    expect(controller.zoomPage(github.id, 'reset')).toMatchObject({ siteHasZoom: false })
    expect([github, githubOtherPort, docs].map(percent)).toEqual([110, 110, 110])
  })

  it("restores the site's zoom after Orca's UI zoom is copied onto the page", () => {
    const controller = new BrowserSiteDisplayController()
    const ui = uiStore()
    controller.followZoomSettings(ui)
    const guest = fakeGuest('https://github.com/')
    controller.onGuestRegistered(guest, null, guest.url)
    controller.zoomPage(guest.id, 'in')
    // Electron copies the embedder's zoom (here 120%) onto every webview, on change and after commits.
    const copyUIZoom = (): void => {
      guest.level = 1
    }

    copyUIZoom()
    ui.update({ uiZoomLevel: 1 })
    expect(percent(guest)).toBe(110)

    controller.onMainFrameNavigationStarted(guest.id, 'https://github.com/next')
    guest.url = 'https://github.com/next'
    controller.onMainFrameDocumentSettled(guest.id)
    copyUIZoom()
    guest.emit('dom-ready')
    expect(percent(guest)).toBe(110)

    copyUIZoom()
    controller.zoomPage(guest.id, 'in')
    expect(percent(guest)).toBe(125)
  })
})

describe('BrowserSiteDisplayController color scheme', () => {
  it('sets the site scheme as navigation starts and clears it once on leaving', () => {
    const controller = new BrowserSiteDisplayController()
    const guest = fakeGuest('https://github.com/')
    controller.onGuestRegistered(guest, null, guest.url)
    controller.setColorScheme(guest.id, 'dark')

    // Why it matters: each send replaces every emulated feature, including an agent's own.
    controller.zoomPage(guest.id, 'in')
    commit(controller, guest, 'https://docs.example.com/')
    commit(controller, guest, 'https://news.example.com/')
    commit(controller, guest, 'https://github.com/x')

    expect(guest.mediaSent).toEqual(['dark', '', 'dark', 'dark'])
  })

  it('puts the scheme back when a navigation to another site never commits', () => {
    const controller = new BrowserSiteDisplayController()
    const guest = fakeGuest('https://github.com/')
    controller.onGuestRegistered(guest, null, guest.url)
    controller.setColorScheme(guest.id, 'dark')

    // e.g. a link that turns into a download: the GitHub page stays on screen.
    controller.onMainFrameNavigationStarted(guest.id, 'https://objects.githubusercontent.com/x.zip')
    controller.onMainFrameDocumentSettled(guest.id)

    expect(guest.mediaSent).toEqual(['dark', '', 'dark'])
  })

  it('gives a restored tab its scheme when its first load started before it registered', () => {
    const controller = new BrowserSiteDisplayController()
    const first = fakeGuest('https://github.com/')
    controller.onGuestRegistered(first, null, first.url)
    controller.setColorScheme(first.id, 'light')

    const restored = fakeGuest('')
    controller.onGuestRegistered(restored, null, '')
    restored.url = 'https://github.com/restored'
    controller.onMainFrameDocumentSettled(restored.id)

    expect(restored.mediaSent).toEqual(['light'])
  })

  it('attaches again after DevTools detaches the debugger', () => {
    const controller = new BrowserSiteDisplayController()
    const guest = fakeGuest('https://github.com/')
    controller.onGuestRegistered(guest, null, guest.url)
    controller.setColorScheme(guest.id, 'dark')

    guest.debugger.detach()
    expect(guest.debugger.isAttached()).toBe(false)
    commit(controller, guest, 'https://github.com/next')

    expect(guest.debugger.isAttached()).toBe(true)
    expect(guest.mediaSent.at(-1)).toBe('dark')
  })
})

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
