import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const electronPackageDir = path.dirname(require.resolve("electron/package.json"));

export default {
  appId: "ai.selfme.desktop",
  productName: "SelfMe",
  directories: {
    output: "dist-app",
    buildResources: "public"
  },
  files: [
    "dist-electron/**/*",
    "dist-renderer/**/*",
    "package.json"
  ],
  extraResources: [
    {
      from: "dist-runtime/gateway.cjs",
      to: "runtime/gateway.cjs"
    },
    {
      from: "public/icons/icon.png",
      to: "icons/icon.png"
    }
  ],
  electronDist: path.join(electronPackageDir, "dist"),
  npmRebuild: false,
  asar: true,
  mac: {
    category: "public.app-category.productivity",
    icon: "icons/icon.icns",
    target: [
      "dir"
    ]
  }
};
