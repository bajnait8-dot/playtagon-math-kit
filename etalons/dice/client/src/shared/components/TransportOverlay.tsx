import type { TransportError } from '@playtagon/front-sdk'

/**
 * Full-screen transport overlays (React analog of test-game's error window + PlayGuard):
 *  - `error` → error modal on top of everything; "Try Again" reloads when recoverable.
 *  - `delayed` → dimmed backdrop + spinner while the network is slow (onNetworkDelay).
 * Error takes precedence over the delay state.
 */
export function TransportOverlay({ error, delayed }: { error: TransportError | null; delayed: boolean }) {
  if (error) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
        <div className="og-card flex max-w-sm flex-col items-center gap-3 p-6 text-center" style={{ borderColor: 'var(--og-danger)' }}>
          <div className="text-base font-semibold" style={{ color: 'var(--og-danger)' }}>Error</div>
          <div className="text-sm" style={{ color: 'var(--og-text)' }}>{error.message}</div>
          <div className="text-xs" style={{ color: 'var(--og-text-muted)' }}>error code: {error.serverCode ?? error.code}</div>
          {error.recoverable ? (
            <button className="og-btn-primary mt-1" onClick={() => window.location.reload()}>Try Again</button>
          ) : (
            <div className="text-xs" style={{ color: 'var(--og-text-muted)' }}>Game cannot continue</div>
          )}
        </div>
      </div>
    )
  }

  if (delayed) {
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
        <div className="h-12 w-12 animate-spin rounded-full border-4" style={{ borderColor: 'rgba(255,255,255,0.25)', borderTopColor: '#fff' }} />
      </div>
    )
  }

  return null
}
