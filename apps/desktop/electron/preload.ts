import { contextBridge } from "electron";

// 这里先暴露一个极小的桥，后续再逐步接 IPC 与本地能力。
contextBridge.exposeInMainWorld("selfmeDesktop", {
  platform: process.platform
});
