import { contextBridge } from "electron";

function readCliOption(name: string): string | undefined {
  const exactIndex = process.argv.findIndex((argument) => argument === name);

  if (exactIndex >= 0) {
    return process.argv[exactIndex + 1];
  }

  const prefix = `${name}=`;
  const prefixedArgument = process.argv.find((argument) => argument.startsWith(prefix));

  return prefixedArgument ? prefixedArgument.slice(prefix.length) : undefined;
}

// 这里先暴露一个极小的桥，后续再逐步接 IPC 与本地能力。
contextBridge.exposeInMainWorld("selfmeDesktop", {
  platform: process.platform,
  runtime: {
    gatewayHttpUrl: readCliOption("--gateway-http-url") ?? "http://127.0.0.1:8000",
    gatewayWsUrl: readCliOption("--gateway-ws-url") ?? "ws://127.0.0.1:8000/ws"
  }
});
