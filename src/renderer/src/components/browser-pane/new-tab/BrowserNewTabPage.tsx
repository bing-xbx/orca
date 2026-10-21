import { useMemo } from 'react'
import { CircleDot, GitMerge, GitPullRequest, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useRepoById, useWorktreeById } from '@/store/selectors'
import { prepareBrowserHistoryEntries, rankBrowserTopSites } from '@/lib/browser-history-match'
import { BrowserFavicon } from '@/components/browser-favicon'
import { LinearIcon } from '@/components/icons/LinearIcon'
import { JiraIcon } from '@/components/icons/JiraIcon'
import type { BrowserHistoryEntry } from '../../../../../shared/browser-workspace-types'
import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { ReviewIcon } from '../../sidebar/worktree-review-helpers'
import { workspaceAttachmentLabel } from '../../sidebar/worktree-attachment-editing'
import { workspaceAttachmentReferenceLabel } from '../../../../../shared/workspace-attachments'
import type { WorkspaceLinkedItemRow } from '../../sidebar/workspace-hover-attachments'
import { BrowserNewTabTile } from './browser-new-tab-tile'
import { useBrowserNewTabLinkedItems } from './use-browser-new-tab-linked-items'
import { useBrowserNewTabServers, type BrowserNewTabServer } from './use-browser-new-tab-servers'
import { BrowserNewTabServerTile } from './browser-new-tab-server-tile'
import { useWorktreeRuntimeTarget } from '@/runtime/use-worktree-runtime-target'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'

const SUGGESTED_TILE_LIMIT = 8
const NO_LINKED_ITEMS: WorkspaceLinkedItemRow[] = []

type BrowserNewTabServers = {
  servers: BrowserNewTabServer[]
  runtimeTarget: RuntimeClientTarget | null
  /** False when this tab's page runs on another machine than the workspace's ports. */
  openInPlace: boolean
}

/** The page a blank browser tab shows: this workspace's servers and links, then the sites you visit most. */
export function BrowserNewTabPage({
  worktreeId,
  onOpenUrl,
  serversElsewhere = false
}: {
  worktreeId: string
  onOpenUrl: (url: string) => void
  /** This tab's page runs on another machine than the workspace's ports, so they open on theirs. */
  serversElsewhere?: boolean
}): React.JSX.Element {
  const worktree = useWorktreeById(worktreeId)
  const repo = useRepoById(worktree?.repoId ?? null) ?? undefined
  const runtimeTarget = useWorktreeRuntimeTarget(worktreeId)
  const servers: BrowserNewTabServers = {
    servers: useBrowserNewTabServers(worktreeId, runtimeTarget),
    runtimeTarget,
    openInPlace: !serversElsewhere
  }
  return worktree ? (
    <BrowserNewTabWorktreePage
      worktree={worktree}
      repo={repo}
      servers={servers}
      onOpenUrl={onOpenUrl}
    />
  ) : (
    <BrowserNewTabPageLayout
      linkedItems={NO_LINKED_ITEMS}
      servers={servers}
      onOpenUrl={onOpenUrl}
    />
  )
}

function BrowserNewTabWorktreePage({
  worktree,
  repo,
  servers,
  onOpenUrl
}: {
  worktree: Worktree
  repo: Repo | undefined
  servers: BrowserNewTabServers
  onOpenUrl: (url: string) => void
}): React.JSX.Element {
  const linkedItems = useBrowserNewTabLinkedItems(worktree, repo)
  return (
    <BrowserNewTabPageLayout linkedItems={linkedItems} servers={servers} onOpenUrl={onOpenUrl} />
  )
}

function BrowserNewTabPageLayout({
  linkedItems,
  servers: { servers, runtimeTarget, openInPlace },
  onOpenUrl
}: {
  linkedItems: WorkspaceLinkedItemRow[]
  servers: BrowserNewTabServers
  onOpenUrl: (url: string) => void
}): React.JSX.Element {
  const browserUrlHistory = useAppStore((s) => s.browserUrlHistory)
  const removeBrowserHistoryEntry = useAppStore((s) => s.removeBrowserHistoryEntry)
  const restoreBrowserHistoryEntry = useAppStore((s) => s.restoreBrowserHistoryEntry)
  const suggested = useMemo(
    () =>
      rankBrowserTopSites({
        prepared: prepareBrowserHistoryEntries(browserUrlHistory),
        limit: SUGGESTED_TILE_LIMIT
      }),
    [browserUrlHistory]
  )
  const openableLinkedItems = linkedItems.filter((row) => row.url)

  const removeSuggestion = (entry: BrowserHistoryEntry): void => {
    const removed = removeBrowserHistoryEntry(entry.normalizedUrl)
    if (!removed) {
      return
    }
    toast(
      translate('browser.newTab.removedFromHistory', 'Removed “{{title}}” from history', {
        title: suggestionLabel(removed)
      }),
      {
        action: {
          label: translate('browser.newTab.undo', 'Undo'),
          onClick: () => restoreBrowserHistoryEntry(removed)
        }
      }
    )
  }

  const hasWorkspaceTiles = servers.length > 0 || openableLinkedItems.length > 0
  if (!hasWorkspaceTiles && suggested.length === 0) {
    return (
      <BrowserNewTabScroller>
        <div className="flex flex-col items-center gap-2.5 px-4 pt-16 text-center">
          <div className="mb-1.5 grid size-13 place-items-center rounded-full border border-border text-muted-foreground">
            <Globe className="size-5" />
          </div>
          <p className="text-base font-semibold text-foreground">
            {translate('auto.components.browser.pane.BrowserPane.366bf5d62c', 'New Tab')}
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {translate(
              'browser.newTab.emptyHint',
              'Search or enter an address above. Sites you visit, dev servers running in this workspace, and its PR and issue will show up here.'
            )}
          </p>
        </div>
      </BrowserNewTabScroller>
    )
  }

  return (
    <BrowserNewTabScroller>
      {hasWorkspaceTiles ? (
        <BrowserNewTabSection label={translate('browser.newTab.thisWorkspace', 'This workspace')}>
          {runtimeTarget
            ? servers.map((server) => (
                <BrowserNewTabServerTile
                  key={`${server.port.connectHost}:${server.port.port}`}
                  server={server}
                  runtimeTarget={runtimeTarget}
                  openInPlace={openInPlace}
                  onOpenUrl={onOpenUrl}
                />
              ))
            : null}
          {openableLinkedItems.map((row) => (
            <LinkedItemTile key={row.key} row={row} onOpenUrl={onOpenUrl} />
          ))}
        </BrowserNewTabSection>
      ) : null}
      {suggested.length > 0 ? (
        <BrowserNewTabSection label={translate('browser.newTab.suggested', 'Suggested')}>
          {suggested.map((entry) => (
            <BrowserNewTabTile
              key={entry.normalizedUrl}
              icon={
                <BrowserFavicon
                  faviconUrl={entry.faviconUrl}
                  className="size-6"
                  fallbackClassName="size-5 text-muted-foreground"
                />
              }
              label={suggestionLabel(entry)}
              tooltip={entry.title.trim() ? `${entry.title} · ${entry.url}` : entry.url}
              onOpen={() => onOpenUrl(entry.url)}
              onRemove={() => removeSuggestion(entry)}
              removeLabel={translate('browser.newTab.removeSuggestion', 'Remove from history')}
            />
          ))}
        </BrowserNewTabSection>
      ) : null}
    </BrowserNewTabScroller>
  )
}

function BrowserNewTabScroller({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="scrollbar-sleek @container absolute inset-0 z-10 overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-[680px] flex-col gap-8 px-3 pt-14 pb-12 @xs:px-6">
        {children}
      </div>
    </div>
  )
}

function BrowserNewTabSection({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-2 text-2xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {label}
      </h2>
      {/* Why steps above the smallest panes: eight tiles land in full rows of 4 or 8. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 @[20rem]:grid-cols-4 @[39rem]:grid-cols-8">
        {children}
      </div>
    </section>
  )
}

function LinkedItemTile({
  row,
  onOpenUrl
}: {
  row: WorkspaceLinkedItemRow
  onOpenUrl: (url: string) => void
}): React.JSX.Element {
  const { item, detail, live, url } = row
  const title = detail?.title || item.title || live?.title
  const label = workspaceAttachmentLabel(item)
  return (
    <BrowserNewTabTile
      icon={<LinkedItemIcon row={row} />}
      // Why the bare number: "Issue #31637" does not fit a tile, so the kind moves below it.
      label={workspaceAttachmentReferenceLabel(item, {
        pr: (number) => `#${number}`,
        issue: (number) => `#${number}`,
        mr: (number) => `!${number}`
      })}
      detail={linkedItemDetail(row)}
      tooltip={title ? `${label} · ${title}` : label}
      onOpen={() => {
        if (url) {
          onOpenUrl(url)
        }
      }}
    />
  )
}

function LinkedItemIcon({ row }: { row: WorkspaceLinkedItemRow }): React.JSX.Element {
  const { item, live } = row
  if (live) {
    return <ReviewIcon review={live} className="size-5" />
  }
  if (item.provider === 'linear') {
    return <LinearIcon className="size-5 text-muted-foreground" />
  }
  if (item.provider === 'jira') {
    return <JiraIcon className="size-5 text-muted-foreground" />
  }
  if (item.type === 'mr') {
    return <GitMerge className="size-5 text-muted-foreground" />
  }
  if (item.type === 'pr') {
    return <GitPullRequest className="size-5 text-muted-foreground" />
  }
  return (
    <CircleDot
      className={
        linkedIssueState(row) === 'open'
          ? 'size-5 text-workspace-status-review/80'
          : 'size-5 text-muted-foreground'
      }
    />
  )
}

function linkedItemDetail(row: WorkspaceLinkedItemRow): string | undefined {
  const { item } = row
  const kind =
    item.provider === 'linear' || item.provider === 'jira'
      ? null
      : item.type === 'issue'
        ? translate('browser.newTab.kind.issue', 'Issue')
        : item.type === 'mr'
          ? translate('browser.newTab.kind.mr', 'MR')
          : translate('browser.newTab.kind.pr', 'PR')
  const state = linkedItemState(row)
  return [kind, state].filter(Boolean).join(' · ') || undefined
}

function linkedItemState({ detail, live, liveTask }: WorkspaceLinkedItemRow): string | undefined {
  if (live?.state === 'open') {
    return translate('browser.newTab.state.open', 'Open')
  }
  if (live?.state === 'draft') {
    return translate('browser.newTab.state.draft', 'Draft')
  }
  if (live?.state === 'merged') {
    return translate('browser.newTab.state.merged', 'Merged')
  }
  if (live?.state === 'closed') {
    return translate('browser.newTab.state.closed', 'Closed')
  }
  const stateName =
    detail?.stateName ?? (liveTask && 'stateName' in liveTask ? liveTask.stateName : undefined)
  if (stateName) {
    return stateName
  }
  const issueState = linkedIssueState({ detail, liveTask })
  if (issueState === 'open') {
    return translate('browser.newTab.state.open', 'Open')
  }
  if (issueState === 'closed') {
    return translate('browser.newTab.state.closed', 'Closed')
  }
  return undefined
}

function linkedIssueState({
  detail,
  liveTask
}: Pick<WorkspaceLinkedItemRow, 'detail' | 'liveTask'>): 'open' | 'closed' | undefined {
  return detail?.issueState ?? (liveTask && 'number' in liveTask ? liveTask.state : undefined)
}

function suggestionLabel(entry: BrowserHistoryEntry): string {
  if (entry.title.trim()) {
    return entry.title
  }
  try {
    return new URL(entry.url).host.replace(/^www\./, '')
  } catch {
    return entry.url
  }
}
