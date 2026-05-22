import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm", "cjs"],          // dual package: ESM + CommonJS
  dts: true,                        // emit .d.ts declaration files
  sourcemap: true,
  clean: true,                      // wipe dist/ before each build
  splitting: false,
  treeshake: true,
  minify: false,                    // keep readable for debugging; set true for prod
  target: "es2017",
  banner: {
    js: `/* chat-analytics-sdk v1 — MIT License */`,
  },
});
