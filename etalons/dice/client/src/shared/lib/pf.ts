import {
  randomClientSeed,
  MAX_CLIENT_SEED_LEN,
  type IPFTransport,
  type SeedState,
  type VerifyRoundResult,
} from '@playtagon/front-sdk'
// The client imports game types by relative path (DiceGame.tsx uses
// '../../../server/model/types.js'; shared/lib/ is one directory deeper).
import type { DiceGameTypes } from '../../../../server/model/types.js'

type PFTransport = IPFTransport<DiceGameTypes>

/**
 * Thin wrapper over the Debug-RGS transport's provably-fair methods. All calls are
 * non-fatal: on error the underlying promise rejects and the caller (Fairness window)
 * shows the message inline. Mirrors playtagon-sdk/games/fairness-game FairnessPanel.
 */
export function createPFService(transport: PFTransport) {
  let last: SeedState | null = null

  async function getSeedState(): Promise<SeedState> {
    last = await transport.getSeedState()
    return last
  }

  async function rotate(newClientSeed?: string): Promise<SeedState> {
    const seed = (newClientSeed ?? randomClientSeed()).trim()
    if (seed.length > MAX_CLIENT_SEED_LEN) {
      throw new Error(`Client seed too long (max ${MAX_CLIENT_SEED_LEN} chars)`)
    }
    const state = await transport.rotate(seed)
    last = state
    return state
  }

  // Rotate, then reveal the just-retired server seed via unhash(previousHash).
  // The reveal is non-fatal: a rotate that succeeds but fails to unhash still resolves
  // with revealedServerSeed = null (the player can unhash manually later).
  async function rotateAndReveal(
    newClientSeed?: string,
  ): Promise<{ state: SeedState; revealedServerSeed: string | null }> {
    const prevHash = last?.serverSeedHash ?? ''
    const state = await rotate(newClientSeed)
    let revealedServerSeed: string | null = null
    if (prevHash) {
      try {
        revealedServerSeed = (await transport.unhash(prevHash)).serverSeed
      } catch {
        revealedServerSeed = null
      }
    }
    return { state, revealedServerSeed }
  }

  function unhash(serverSeedHash: string): Promise<{ serverSeed: string }> {
    return transport.unhash(serverSeedHash)
  }

  function verify(
    serverSeed: string,
    clientSeed: string,
    nonceFrom: number,
    nonceTo: number,
  ): Promise<VerifyRoundResult<DiceGameTypes>[]> {
    return transport.verify(serverSeed, clientSeed, nonceFrom, nonceTo)
  }

  return { getSeedState, rotate, rotateAndReveal, unhash, verify }
}

export type PFService = ReturnType<typeof createPFService>
