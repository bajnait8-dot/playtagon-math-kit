import type { ReactNode } from 'react'

interface MobileLayoutProps {
  balance: ReactNode
  dropStats: ReactNode
  game: ReactNode
  /** Scrollable bet controls (toggle / bet amount / ½×2 / auto settings) — no BET */
  controls: ReactNode
  /** BET / Start button — pinned to the bottom, above the footer */
  action: ReactNode
  footer: ReactNode
}

/**
 * Mobile portrait layout.
 * Balance, drop-stats and the game zone scroll as one column. The bet controls
 * (mode toggle / bet amount / ½×2) and the BET button are pinned together at the
 * bottom — controls sit directly on top of BET — so the primary action and its
 * inputs are always reachable above the footer.
 */
export function MobileLayout({ balance, dropStats, game, controls, action, footer }: MobileLayoutProps) {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{
        background: 'var(--og-bg)',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1.5px, transparent 1.6px)',
        backgroundSize: '14px 14px',
      }}
    >
      {/* Scrollable column. The balance bar is flush to the top edge and spans the
          full width (no padding); the rest of the column keeps its padding/gap.
          The bet controls live at the BOTTOM of the scroll area (on a card) so that
          when Auto is selected the extra auto-bet settings extend the scroll DOWN
          instead of pushing the game up. Only BET stays pinned below. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {/* Balance pill — edge-to-edge, sticky to the top of the scroll area so it
            stays put while the column scrolls. Square corners (flush to the edge);
            override the pill rounding here, not in the shared desktop component. */}
        <div className="sticky top-0 z-10 [&>*]:w-full [&>*]:justify-center [&>*]:rounded-none">{balance}</div>
        {/* Drop-stats chips are right-aligned, so drop the left padding to let the
            strip run to the left edge (keeps right/top padding off the edges). */}
        <div className="pr-3 pt-3">{dropStats}</div>
        <div className="flex flex-col gap-3 px-3 pb-3 pt-3">
          {game}
        </div>
        {/* Bet controls on an edge-to-edge card. It flex-grows to fill the space down
            to the pinned BET (so the card backing reaches the button with no gap in
            Manual); content stays at the top of the card. A top margin gives clear
            spacing between the info strip above and this panel. In Auto the extra
            settings simply extend the scroll downward. */}
        <div className="og-card mt-6 flex-1 p-3" style={{ borderRadius: 'var(--og-radius) var(--og-radius) 0 0' }}>{controls}</div>
      </div>
      {/* Pinned bottom — only the BET action and the footer stay fixed. */}
      <div className="shrink-0">
        <div className="og-card p-3" style={{ borderRadius: 0 }}>{action}</div>
        {footer}
      </div>
    </div>
  )
}
