import { describe, it, expect, vi } from "vitest";
import { createPFService } from "./pf";

function fakeTransport(overrides = {}) {
  return {
    getSeedState: vi.fn().mockResolvedValue({
      clientSeed: "abc", serverSeedHash: "H0", nextServerSeedHash: "H1", nonce: 3,
    }),
    rotate: vi.fn().mockResolvedValue({
      clientSeed: "new", serverSeedHash: "H1", nextServerSeedHash: "H2", nonce: 0,
    }),
    unhash: vi.fn().mockResolvedValue({ serverSeed: "revealed-seed" }),
    verify: vi.fn().mockResolvedValue([{ nonce: 0, data: { roll: 4200 } }]),
    ...overrides,
  };
}

describe("pf service", () => {
  it("rotateAndReveal rotates then unhashes the previous hash", async () => {
    const t = fakeTransport();
    const pf = createPFService(t as never);
    await pf.getSeedState(); // caches current state (serverSeedHash "H0")
    const { state, revealedServerSeed } = await pf.rotateAndReveal("new");
    expect(t.rotate).toHaveBeenCalledWith("new");
    expect(t.unhash).toHaveBeenCalledWith("H0");
    expect(state.nonce).toBe(0);
    expect(revealedServerSeed).toBe("revealed-seed");
  });

  it("rotate rejects a client seed longer than MAX_CLIENT_SEED_LEN", async () => {
    const t = fakeTransport();
    const pf = createPFService(t as never);
    await expect(pf.rotate("x".repeat(65))).rejects.toThrow(/seed/i);
    expect(t.rotate).not.toHaveBeenCalled();
  });

  it("verify passes the nonce range through", async () => {
    const t = fakeTransport();
    const pf = createPFService(t as never);
    const res = await pf.verify("s", "c", 0, 0);
    expect(t.verify).toHaveBeenCalledWith("s", "c", 0, 0);
    expect(res).toEqual([{ nonce: 0, data: { roll: 4200 } }]);
  });
});
