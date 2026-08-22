import {
  randomClientSeed,
  MAX_CLIENT_SEED_LEN,
  type IPFTransport,
  type SeedState,
  type VerifyRoundResult,
} from '@playtagon/front-sdk';
import type { SicBoGameTypes } from '../../../server/model/types.js';

type PFTransport = IPFTransport<SicBoGameTypes>;

/**
 * Тонкая обёртка над provably-fair методами транспорта — ПЕРЕНЕСЕНА ИЗ DICE
 * (games/dice/.../shared/lib/pf.ts), там же обновлённый SDK под неё.
 *
 * Все вызовы не фатальны: при ошибке промис реджектится, а окно показывает
 * сообщение внутри себя — честность проверяют по желанию, игру это ломать не
 * должно.
 */
export function createPFService(transport: PFTransport) {
  let last: SeedState | null = null;

  async function getSeedState(): Promise<SeedState> {
    last = await transport.getSeedState();
    return last;
  }

  async function rotate(newClientSeed?: string): Promise<SeedState> {
    const seed = (newClientSeed ?? randomClientSeed()).trim();
    if (seed.length > MAX_CLIENT_SEED_LEN) {
      throw new Error(`Client seed too long (max ${MAX_CLIENT_SEED_LEN} chars)`);
    }
    const state = await transport.rotate(seed);
    last = state;
    return state;
  }

  /**
   * Сменить пару сидов и раскрыть только что отработавший серверный.
   * Раскрытие НЕ фатально: если unhash не прошёл, ротация всё равно состоялась
   * (игрок сможет раскрыть сид вручную позже).
   */
  async function rotateAndReveal(
    newClientSeed?: string,
  ): Promise<{ state: SeedState; revealedServerSeed: string | null }> {
    const prevHash = last?.serverSeedHash ?? '';
    const state = await rotate(newClientSeed);
    let revealedServerSeed: string | null = null;
    if (prevHash) {
      try {
        revealedServerSeed = (await transport.unhash(prevHash)).serverSeed;
      } catch {
        revealedServerSeed = null;
      }
    }
    return { state, revealedServerSeed };
  }

  function unhash(serverSeedHash: string): Promise<{ serverSeed: string }> {
    return transport.unhash(serverSeedHash);
  }

  /**
   * Пересчитать раунды по паре сидов — вкладка VERIFY. Сервер прогоняет тот же
   * поток случайных чисел и возвращает раскладку мин: игрок сверяет её с тем,
   * что видел в игре.
   */
  function verify(
    serverSeed: string,
    clientSeed: string,
    nonceFrom: number,
    nonceTo: number,
  ): Promise<VerifyRoundResult<SicBoGameTypes>[]> {
    return transport.verify(serverSeed, clientSeed, nonceFrom, nonceTo);
  }

  return { getSeedState, rotate, rotateAndReveal, unhash, verify };
}

export type PFService = ReturnType<typeof createPFService>;
