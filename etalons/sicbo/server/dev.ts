import { createDebugRgs } from "@playtagon/runtime";

createDebugRgs({
  clientDir: "../client",
  port: 3007,
  vitePort: 5180,
  currency: "USD",
  balance: 1000_00,
  denomination: 2,
  bets: {
    normal: { min: 1, max: 1000_00, default: 1_00, list: [1_00, 5_00, 10_00, 50_00, 100_00, 1000_00] },
  },
  platformParams: { lang: "en", mode: "gambling" },
}).start();
