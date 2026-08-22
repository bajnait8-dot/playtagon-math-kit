import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { playtagonPlugin } from "@playtagon/runtime/vite";

export default defineConfig({
  // React нужен ТОЛЬКО ради DiceScene: кубики с физикой живут в своём
  // WebGL-канвасе поверх Pixi (см. diceOverlay). Вся остальная игра — Pixi.
  plugins: [react(), playtagonPlugin()],
  // host: true → vite слушает 0.0.0.0 (LAN), чтобы открывать слот с телефона.
  // Dev-only, на прод-сборку не влияет.
  server: { host: true },
});
