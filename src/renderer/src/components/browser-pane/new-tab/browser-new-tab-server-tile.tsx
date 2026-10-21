import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { BrowserFavicon } from '@/components/browser-favicon'
import { useLocalhostLabelRouteForPort } from '@/lib/workspace-port-localhost-label-selector'
import { addressForPort, browserUrlForPort } from '@/lib/workspace-port-urls'
import {
  openWorkspacePortInBrowser,
  resolveWorkspacePortBrowserUrl
} from '@/lib/workspace-port-actions'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'
import { BrowserNewTabTile } from './browser-new-tab-tile'
import type { BrowserNewTabServer } from './use-browser-new-tab-servers'

export function BrowserNewTabServerTile({
  server,
  runtimeTarget,
  openInPlace,
  onOpenUrl
}: {
  server: BrowserNewTabServer
  runtimeTarget: RuntimeClientTarget
  /** False when this tab's page runs on another machine than the port, which only a new tab on the port's host can reach. */
  openInPlace: boolean
  onOpenUrl: (url: string) => void
}): React.JSX.Element {
  const { port, title, faviconDataUrl } = server
  const localhostLabelRoute = useLocalhostLabelRouteForPort(port)
  const createBrowserTab = useAppStore((s) => s.createBrowserTab)
  const setRemoteBrowserPageHandle = useAppStore((s) => s.setRemoteBrowserPageHandle)
  const address = addressForPort(port)

  const open = async (): Promise<void> => {
    if (openInPlace) {
      onOpenUrl(await resolveWorkspacePortBrowserUrl({ port, runtimeTarget, localhostLabelRoute }))
      return
    }
    const result = await openWorkspacePortInBrowser({
      port,
      runtimeTarget,
      createBrowserTab,
      setRemoteBrowserPageHandle,
      localhostLabelRoute
    })
    if (!result.ok) {
      toast.error(
        translate('browser.newTab.openServerFailed', 'Couldn’t open {{address}}', { address }),
        {
          description: result.reason
        }
      )
    }
  }

  return (
    <BrowserNewTabTile
      icon={
        <BrowserFavicon
          faviconUrl={faviconDataUrl}
          className="size-6"
          fallbackClassName="size-5 text-muted-foreground"
        />
      }
      label={title ?? port.processName ?? address}
      detail={`:${port.port}`}
      detailMono
      tooltip={title ? `${title} · ${browserUrlForPort(port)}` : browserUrlForPort(port)}
      live
      onOpen={() => void open()}
    />
  )
}
