import { defineConfig } from "tsup";

const isDev = process.env.npm_lifecycle_event === "dev";
const packageVersion = process.env.npm_package_version;

export default defineConfig({
  clean: true,
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  minify: !isDev,
  target: "esnext",
  outDir: "dist",
  splitting: false,  // Disable code splitting to avoid cryptic chunk names
  outExtension: ({ format }) => ({
    js: ".js",
  }),
  onSuccess: isDev ? "node dist/cli.js" : undefined,
  define: {
    "process.env.NPM_PACKAGE_VERSION": JSON.stringify(packageVersion),
  },
});
