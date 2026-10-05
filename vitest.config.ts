import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // The reused Windows node_modules contains top-level and pnpm package copies.
    // These identity-bearing ESM packages must share one test module instance.
    alias: Object.fromEntries(["@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/commands", "@lezer/common", "@lezer/highlight"].map(name => [
      name,
      fileURLToPath(new URL(`./node_modules/${name}/dist/index.js`, import.meta.url)),
    ])),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: { deps: { inline: [/codemirror/, /lezer/] } },
  },
});
