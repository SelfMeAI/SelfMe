/// <reference types="vite/client" />

declare global {
  interface Window {
    selfmeDesktop?: {
      platform: NodeJS.Platform;
      runtime: {
        gatewayHttpUrl: string;
        gatewayWsUrl: string;
      };
    };
  }
}

export {};
