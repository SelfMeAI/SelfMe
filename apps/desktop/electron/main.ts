import { BrowserWindow, app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, "../..");
const desktopIconPath = path.join(workspaceRoot, "public/icons/icon.png");

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    icon: desktopIconPath,
    webPreferences: {
      preload: path.join(currentDir, "preload.js"),
      contextIsolation: true
    }
  });

  // 开发期优先连接 Vite，本地构建时回退到静态文件。
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    window.webContents.openDevTools();
    return;
  }

  void window.loadFile(path.join(currentDir, "../dist-renderer/index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(desktopIconPath);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
