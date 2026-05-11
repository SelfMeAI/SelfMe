import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(currentDir, "..");
const workspaceRoot = path.resolve(desktopRoot, "../..");
const gatewayEntryPath = path.join(workspaceRoot, "apps/gateway/src/index.ts");
const protocolEntryPath = path.join(workspaceRoot, "packages/protocol/src/index.ts");
const outputPath = path.join(desktopRoot, "dist-runtime/gateway.cjs");

await build({
  entryPoints: [gatewayEntryPath],
  outfile: outputPath,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  external: ["electron"],
  plugins: [
    {
      name: "selfme-workspace-alias",
      setup(buildContext) {
        buildContext.onResolve({ filter: /^@selfme\/protocol$/ }, () => ({
          path: protocolEntryPath
        }));
      }
    }
  ]
});
