import type { ReactNode } from 'react'

interface LandscapeLayoutProps {
  sidebar: ReactNode
  game: ReactNode
  /** Balance chip — sits at the start of the top line, left of the drop-stats */
  balance: ReactNode
  dropStats: ReactNode
  footer: ReactNode
}

export function LandscapeLayout({ sidebar, game, balance, dropStats, footer }: LandscapeLayoutProps) {
  // Background dot texture — same dot as the toggle/BET decor (3px circle on a 7px
  // grid), kept faint so it reads as a subtle game-area texture over #09090b.
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background: 'var(--og-bg)',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1.5px, transparent 1.6px)',
        backgroundSize: '14px 14px',
      }}
    >
      <div className="flex h-full w-full max-w-[1280px] flex-col overflow-hidden">
        {/* Content gets the page padding; the footer sits flush to the bottom edge
            with no top padding, spanning the full width. */}
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="flex w-[340px] shrink-0 flex-col">{sidebar}</div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            {/* Top line: balance chip (left) on the same row as the drop-stats (right).
                Drop-stats take the remaining width and clip oldest chips on overflow. */}
            <div className="flex items-center gap-4">
              {balance}
              <div className="flex min-w-0 flex-1">{dropStats}</div>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center">{game}</div>
          </div>
        </div>
        <div className="shrink-0">{footer}</div>
      </div>
    </div>
  )
}
