import type { ReactNode } from 'react'

interface DesktopLayoutProps {
  sidebar: ReactNode
  game: ReactNode
  /** Balance chip — sits at the start of the top line, left of the drop-stats */
  balance: ReactNode
  dropStats: ReactNode
  footer: ReactNode
}

/**
 * Desktop layout — same structure as the tablet (landscape) layout but fluid:
 * it stretches to the full viewport width instead of the 1280px tablet cap, so
 * the game area gets more room on large screens. Sidebar left, top line with the
 * balance chip + drop-stats, centred game zone, full-width footer flush to bottom.
 */
export function DesktopLayout({ sidebar, game, balance, dropStats, footer }: DesktopLayoutProps) {
  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        background: 'var(--og-bg)',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1.5px, transparent 1.6px)',
        backgroundSize: '14px 14px',
      }}
    >
      {/* Content gets the page padding; the footer sits flush to the bottom edge
          with no top padding, spanning the full width. */}
      <div className="flex min-h-0 flex-1 gap-6 p-6">
        <div className="flex w-[340px] shrink-0 flex-col">{sidebar}</div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
          {/* Top line: balance chip (left) on the same row as the drop-stats (right) */}
          <div className="flex items-center gap-4">
            {balance}
            <div className="flex min-w-0 flex-1">{dropStats}</div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">{game}</div>
        </div>
      </div>
      <div className="shrink-0">{footer}</div>
    </div>
  )
}
