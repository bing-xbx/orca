import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function BrowserNewTabTile({
  icon,
  label,
  detail,
  detailMono = false,
  tooltip,
  live = false,
  onOpen,
  onRemove,
  removeLabel
}: {
  icon: React.ReactNode
  label: string
  detail?: string
  detailMono?: boolean
  tooltip: string
  /** A green dot on the icon: the thing behind the tile is answering right now. */
  live?: boolean
  onOpen: () => void
  onRemove?: () => void
  removeLabel?: string
}): React.JSX.Element {
  return (
    <div className="group/tile relative min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full min-w-0 flex-col items-center gap-2 rounded-xl px-1.5 pt-3.5 pb-2.5 outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span className="relative grid size-12 place-items-center rounded-xl border border-border bg-muted">
              {icon}
              {live ? (
                <span
                  aria-hidden
                  className="absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-background bg-workspace-status-review group-hover/tile:border-accent"
                />
              ) : null}
            </span>
            <span className="max-w-full truncate text-xs text-foreground">{label}</span>
            {detail ? (
              <span
                className={cn(
                  '-mt-1.5 max-w-full truncate text-2xs text-muted-foreground',
                  detailMono && 'font-mono'
                )}
              >
                {detail}
              </span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="absolute top-1 right-1 grid size-5 place-items-center rounded-full border border-border bg-popover text-muted-foreground opacity-0 outline-none group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
