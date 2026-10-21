import type { Repo } from '../../../../../shared/repo-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { useWorktreeCardFoundation } from '../../sidebar/use-worktree-card-foundation'
import { useWorktreeCardReviewDetails } from '../../sidebar/use-worktree-card-review-details'
import { useWorktreeCardLinkedDetails } from '../../sidebar/use-worktree-card-linked-details'
import { useWorktreeCardLifecycleEffects } from '../../sidebar/use-worktree-card-lifecycle-effects'
import {
  getWorkspaceLinkedItemRows,
  type WorkspaceLinkedItemRow
} from '../../sidebar/workspace-hover-attachments'

/** The worktree's linked reviews and tasks, fetched and resolved the way its sidebar card does. */
export function useBrowserNewTabLinkedItems(
  worktree: Worktree,
  repo: Repo | undefined
): WorkspaceLinkedItemRow[] {
  const foundation = useWorktreeCardFoundation({ worktree, repo })
  const review = useWorktreeCardReviewDetails({
    worktree,
    repo,
    settings: foundation.settings,
    projectGroups: foundation.projectGroups,
    cardProps: foundation.cardProps,
    newCardStyle: foundation.newCardStyle
  })
  const linked = useWorktreeCardLinkedDetails({
    worktree,
    newCardStyle: foundation.newCardStyle,
    deleteState: foundation.deleteState,
    branch: review.branch,
    issueEntry: review.issueEntry,
    linearIssueEntry: review.linearIssueEntry,
    linearIssueFallbackEntry: review.linearIssueFallbackEntry,
    prDisplay: review.prDisplay
  })
  // Why details open: the page shows titles and states up front, as the card's hover does.
  useWorktreeCardLifecycleEffects({
    worktree,
    repo,
    isFolder: review.isFolder,
    hostedReviewCacheKey: review.hostedReviewCacheKey,
    cachedBranchFallbackGitHubPRNumber: review.cachedBranchFallbackGitHubPRNumber,
    linkedGitLabMR: review.linkedGitLabMR,
    linkedBitbucketPR: review.linkedBitbucketPR,
    linkedAzureDevOpsPR: review.linkedAzureDevOpsPR,
    linkedGiteaPR: review.linkedGiteaPR,
    branch: review.branch,
    fetchHostedReviewForBranch: foundation.fetchHostedReviewForBranch,
    shouldRefreshHostedReview: false,
    newCardStyle: true,
    hoverDetailsOpen: true,
    showIssue: true,
    issueCacheKey: review.issueCacheKey,
    fetchIssue: foundation.fetchIssue,
    showLinearIssue: true,
    fetchLinearIssue: foundation.fetchLinearIssue,
    linearSourceContext: review.linearSourceContext,
    linearWorkspaceId: review.linearWorkspaceId
  })
  return getWorkspaceLinkedItemRows(
    worktree,
    {
      review: review.prDisplay,
      issue: linked.issueDisplay,
      linearIssue: linked.linearIssue,
      jiraIssue: linked.jiraIssueDisplay
    },
    // Why no per-item details: their lookup routes by the focused server, which this page must not.
    undefined
  )
}
